import { dbFirebase, authFirebase } from "../../config/firebase-admin.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";
const COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
let usersCountCache = { total: null, timestamp: 0 };

// GET /api/users  — lista paginada de usuarios (solo admin)
export const getUsers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // nextPageToken permite paginación en Firebase Auth
    const pageToken = req.query.pageToken || undefined;
    const listResult = await authFirebase.listUsers(limit, pageToken);

    // Enriquecemos con el rol desde Firestore (en paralelo, limitado a 10 por batch)
    const enriched = await Promise.all(
      listResult.users.map(async (user) => {
        const doc = await dbFirebase.collection("users").doc(user.uid).get();
        const data = doc.exists ? doc.data() : {};
        return {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          disabled: user.disabled,
          createdAt: user.metadata.creationTime,
          role: data.role ?? "student",
          points: data.points ?? 0,
        };
      }),
    );

    res.status(200).json({
      users: enriched,
      nextPageToken: listResult.pageToken ?? null,
    });
  } catch (err) {
    next(err);
  }
};

export const getUsersCount = async (req, res, next) => {
  try {
    const now = Date.now();
    if (
      usersCountCache.total !== null &&
      now - usersCountCache.timestamp < COUNT_CACHE_TTL_MS
    ) {
      return res
        .status(200)
        .json({ total: usersCountCache.total, cached: true });
    }

    let total = 0;
    let pageToken;
    do {
      const result = await authFirebase.listUsers(1000, pageToken);
      total += result.users.length;
      pageToken = result.pageToken;
    } while (pageToken);

    usersCountCache = { total, timestamp: now };
    res.status(200).json({ total, cached: false });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/search?email=xxx  — buscar por email (admin)
export const searchUserByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return next(badRequest("Parámetro email requerido"));

    const userRecord = await authFirebase
      .getUserByEmail(email)
      .catch(() => null);
    if (!userRecord) return next(notFound("Usuario no encontrado"));

    const doc = await dbFirebase.collection("users").doc(userRecord.uid).get();
    const data = doc.exists ? doc.data() : {};

    res.status(200).json({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      role: data.role ?? "student",
      points: data.points ?? 0,
    });
  } catch (err) {
    next(err);
  }
};



// POST /api/users/register-exception  — alta de cuenta correo/contraseña
// para emails no institucionales previamente autorizados en emailExceptions.
export const registerWithEmailPassword = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const normalized = String(email || "").trim().toLowerCase();
    console.log('/ __DEBUG_REGISTER__ body recibido:', { email, normalized, passwordLength: password?.length, displayName });

    if (normalized.endsWith("@frba.utn.edu.ar")) {
      return next(badRequest("Los correos institucionales ingresan con Google."));
    }

    const allowed = await isEmailException(normalized);
    if (!allowed) {
      return next(badRequest("Este correo no está autorizado para acceder a la plataforma."));
    }

        // __ITEC_AUTOPATCH_AUTH_PROVIDER__
    const existing = await authFirebase.getUserByEmail(normalized).catch(() => null);

    if (existing) {
      // ¿La cuenta tiene contraseña seteada, o es 100% de un proveedor externo
      // (ej. Google Sign-In)? providerData no incluye "password" en ese caso.
      const hasPasswordProvider = existing.providerData?.some(
        (p) => p.providerId === "password",
      );

      if (!hasPasswordProvider) {
        // __ITEC_AUTOPATCH_SYNC_GOOGLE_EXCEPTION__
        // Esta cuenta ya pasó la validación isEmailException(normalized) de
        // arriba (si no, ya hubiésemos retornado 400 antes), así que el email
        // está autorizado. Sincronizamos el doc de Firestore para que
        // loginWithGoogle / initAuthListener la reconozcan a partir de ahora
        // — sin esto, cuentas creadas por Google ANTES del sistema de
        // excepciones quedan en un bucle: no pueden registrarse por password
        // (ya existen) y loginWithGoogle las rechaza (el flag nunca se seteó).
        await dbFirebase.collection("users").doc(existing.uid).set(
          { isEmailException: true },
          { merge: true },
        );

        const externalProvider = existing.providerData?.[0]?.providerId;
        const providerLabel =
          externalProvider === "google.com" ? "Google" : "otro método";

        return next(
          badRequest(
            `Este correo ya está registrado con ${providerLabel}. Iniciá sesión con el botón de ${providerLabel} en vez de crear una cuenta con contraseña.`,
          ),
        );
      }

      return next(badRequest("Ya existe una cuenta con ese correo. Iniciá sesión."));
    }

    console.log('/ __DEBUG_REGISTER__ llamando createUser con email:', normalized, '| passwordLength:', password?.length);
    const userRecord = await authFirebase.createUser({
      email: normalized,
      password,
      displayName: displayName || "Estudiante",
    });
    console.log('/ __DEBUG_REGISTER__ createUser OK. uid:', userRecord.uid, '| email en userRecord:', userRecord.email, '| providerData:', JSON.stringify(userRecord.providerData));

    await dbFirebase.collection("users").doc(userRecord.uid).set({
      name: displayName || "Estudiante",
      email: normalized,
      role: "student",
      points: 0,
      isEmailException: true,
    });

    res.status(201).json({ uid: userRecord.uid, email: normalized, message: "Cuenta creada" });
  } catch (err) {
    console.error('/ __DEBUG_REGISTER__ error completo en registerWithEmailPassword:', err);
    if (err.code === "auth/email-already-exists") {
      return next(badRequest("Ya existe una cuenta con ese correo."));
    }
    if (err.code === "auth/invalid-password") {
      return next(badRequest("La contraseña debe tener al menos 6 caracteres."));
    }
    next(err);
  }
};

// PATCH /api/users/:uid/role  — cambiar rol (admin)
export const updateUserRole = async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;
    const VALID_ROLES = ["student", "admin", "moderator"];

    if (!VALID_ROLES.includes(role)) {
      return next(
        badRequest(`Rol inválido. Debe ser: ${VALID_ROLES.join(", ")}`),
      );
    }
    // Evitar que el admin se auto-demote accidentalmente
    if (uid === req.user.uid && role !== "admin") {
      return next(badRequest("No podés cambiar tu propio rol"));
    }

    await dbFirebase
      .collection("users")
      .doc(uid)
      .set({ role }, { merge: true });
    res.status(200).json({ uid, role, message: "Rol actualizado" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/points  — sumar/restar puntos (admin)
export const updateUserPoints = async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { points } = req.body;

    const ref = dbFirebase.collection("users").doc(uid);
    const doc = await ref.get();
    if (!doc.exists)
      return next(notFound("Usuario no encontrado en Firestore"));

    const current = doc.data().points ?? 0;
    const newTotal = Math.max(0, current + Number(points));
    await ref.set({ points: newTotal }, { merge: true });

    res.status(200).json({ uid, points: newTotal });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/profile  — el propio usuario actualiza su perfil extendido
export const updateUserProfile = async (req, res, next) => {
  try {
    const { uid } = req.params;

    // Un usuario solo puede editar su propio perfil (salvo admin)
    if (uid !== req.user.uid && req.user.role !== "admin") {
      return next(badRequest("Solo podés editar tu propio perfil."));
    }

    const ALLOWED = [
      "displayName",
      "dni",
      "legajo",
      "specialty",
      "careers",
      "startYear",
      "photoURL",
      "phone",
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      return next(badRequest("Sin datos para actualizar."));
    }

    // Actualizar Firestore (campo name/displayName)
    await dbFirebase.collection("users").doc(uid).set(update, { merge: true });

    // Sincronizar displayName en Firebase Auth si se proveyó
    if (update.displayName) {
      await authFirebase.updateUser(uid, { displayName: update.displayName });
    }

    res.status(200).json({
      uid,
      updated: Object.keys(update),
      message: "Perfil actualizado",
    });
  } catch (err) {
    next(err);
  }
};
// GET /api/users/auth-provider?email=xxx — info pública mínima para dar
// mensajes de error más claros en el login (no requiere estar autenticado).
export const getAuthProvider = async (req, res, next) => {
  try {
    const { email } = req.query;
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return next(badRequest("Parámetro email requerido"));

    const userRecord = await authFirebase
      .getUserByEmail(normalized)
      .catch(() => null);

    if (!userRecord) {
      return res.status(200).json({ exists: false });
    }

    const hasPasswordProvider = userRecord.providerData?.some(
      (p) => p.providerId === "password",
    );
    const externalProvider = userRecord.providerData?.find(
      (p) => p.providerId !== "password",
    )?.providerId;

    res.status(200).json({
      exists: true,
      hasPassword: !!hasPasswordProvider,
      provider: hasPasswordProvider ? "password" : (externalProvider ?? null),
    });
  } catch (err) {
    next(err);
  }
};
