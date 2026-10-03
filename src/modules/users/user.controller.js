import { dbFirebase, authFirebase } from "../../config/firebase-admin.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";
import Role from "../roles/role.model.js";
import { clearUserAuthCache } from "../../middlewares/authMiddleware.js";
import { sendNotificationEmail } from "../../config/mailer.js";
const COUNT_CACHE_TTL_MS = 5 * 60 * 1000;
let usersCountCache = { total: null, timestamp: 0 };

const getFirstFrontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");

const getEmailBrand = () => {
  const webUrl = getFirstFrontendUrl();
  return {
    webUrl,
    logoUrl: `${webUrl}/logo.png`,
    mascotUrl: `${webUrl}/mascot/TEC-Saludando.webp`,
    downloadUrl: process.env.APP_DOWNLOAD_URL || webUrl,
    downloadImageUrl: `${webUrl}/download.png`,
  };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const permissionLabels = {
  "admin.panel": "Administración del panel",
  "users.manage": "Gestión de usuarios",
  "roles.manage": "Gestión de roles y permisos",
  "publications.manage": "Gestión de publicaciones",
  "announcements.manage": "Gestión de avisos",
  "courses.edit": "Edición de cursos",
  "courses.manage": "Administración de cursos",
  "resources.manage": "Gestión de recursos",
};

const permissionName = (permission) =>
  permissionLabels[permission] || String(permission).replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

// Equivalentes inline de la paleta definida en tailwind.config.js.
// Los clientes de correo no procesan las clases Tailwind.
const EMAIL_COLORS = {
  bg: "#111113",
  sidebar: "#161618",
  box: "#242426",
  surface: "#2A2A2D",
  border: "#171717",
  text: "#E5E6EA",
  muted: "#6B6B75",
  sky: "#38BDF8",
  primary: "#022A5E",
  blue: "#2563EB",
  red: "#EF4444",
};

const buildEmailLayout = ({ eyebrow, title, intro, content, primaryLabel, primaryUrl, secondaryLabel, secondaryUrl, secondaryImageUrl }) => {
  const brand = getEmailBrand();
  return `
    <div style="margin:0;background:${EMAIL_COLORS.bg};padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:${EMAIL_COLORS.text}">
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(intro)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:${EMAIL_COLORS.box};border:1px solid ${EMAIL_COLORS.border};border-radius:20px;overflow:hidden">
        <tr>
          <td style="padding:28px 32px 18px;background:${EMAIL_COLORS.sidebar};border-bottom:1px solid ${EMAIL_COLORS.border}">
            <img src="${escapeHtml(brand.logoUrl)}" alt="iTEC" width="112" style="display:block;width:112px;height:auto">
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:74px;vertical-align:top">
                  <img src="${escapeHtml(brand.mascotUrl)}" alt="TEC, mascota de iTEC" width="68" height="68" style="display:block;width:68px;height:68px;object-fit:contain">
                </td>
                <td style="vertical-align:top;padding-left:16px">
                  <p style="margin:4px 0 8px;color:${EMAIL_COLORS.sky};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">${escapeHtml(eyebrow)}</p>
                  <h1 style="margin:0;color:${EMAIL_COLORS.text};font-size:28px;line-height:1.2">${escapeHtml(title)}</h1>
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 18px;color:${EMAIL_COLORS.text};font-size:16px;line-height:1.65">${intro}</p>
            ${content}
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0 8px">
              <tr>
                <td style="padding-right:10px">
                  <a href="${escapeHtml(primaryUrl)}" style="display:inline-block;background:${EMAIL_COLORS.red};border:1px solid ${EMAIL_COLORS.red};border-radius:10px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 20px">${escapeHtml(primaryLabel)}</a>
                </td>
                ${secondaryLabel && secondaryUrl ? `<td><a href="${escapeHtml(secondaryUrl)}" style="display:inline-block;background:${EMAIL_COLORS.primary};border:1px solid ${EMAIL_COLORS.blue};border-radius:10px;color:${EMAIL_COLORS.text};text-decoration:none;font-weight:bold;font-size:14px;padding:10px 14px"><img src="${escapeHtml(secondaryImageUrl)}" alt="${escapeHtml(secondaryLabel)}" width="28" height="28" style="display:inline-block;vertical-align:middle;width:28px;height:28px;margin-right:8px;object-fit:contain"><span style="vertical-align:middle">${escapeHtml(secondaryLabel)}</span></a></td>` : ""}
              </tr>
            </table>
            <p style="margin:26px 0 0;color:${EMAIL_COLORS.muted};font-size:12px;line-height:1.5">Este mensaje fue enviado automáticamente por iTEC.BA. Si no reconocés esta actividad, contactá al equipo de administración.</p>
          </td>
        </tr>
      </table>
    </div>
  `;
};

const sendRoleChangeEmail = async ({ email, name, role, roleDefinition }) => {
  const brand = getEmailBrand();
  const permissions = roleDefinition.permissions?.length
    ? roleDefinition.permissions.map((permission) => `
        <li style="margin:0 0 10px;color:${EMAIL_COLORS.text}">
          <span style="display:inline-block;width:7px;height:7px;margin:0 8px 2px 0;border-radius:50%;background:${EMAIL_COLORS.sky}"></span>
          ${escapeHtml(permissionName(permission))}
        </li>`).join("")
    : `<li style="color:${EMAIL_COLORS.text}">Sin funcionalidades adicionales configuradas</li>`;

  return sendNotificationEmail(
    email,
    `Tu rol en iTEC fue actualizado a ${roleDefinition.name}`,
    buildEmailLayout({
      eyebrow: "Cuenta actualizada",
      title: "Nuevas funciones para vos",
      intro: `Hola <strong style="color:${EMAIL_COLORS.text}">${escapeHtml(name || "Estudiante")}</strong>. Tu rol ahora es <strong style="color:${EMAIL_COLORS.sky}">${escapeHtml(roleDefinition.name)}</strong>.`,
      content: `<div style="background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:18px 20px"><p style="margin:0 0 14px;color:${EMAIL_COLORS.muted};font-size:13px">Funcionalidades habilitadas</p><ul style="padding:0 0 0 4px;margin:0;list-style:none">${permissions}</ul></div>`,
      primaryLabel: "Accedé a la web",
      primaryUrl: brand.webUrl,
      secondaryLabel: "Descargar",
      secondaryUrl: brand.downloadUrl,
      secondaryImageUrl: brand.downloadImageUrl,
    }),
  );
};

const sendWelcomeEmail = async ({ email, name }) => {
  const brand = getEmailBrand();
  return sendNotificationEmail(
    email,
    "¡Bienvenido a iTEC.BA!",
    buildEmailLayout({
      eyebrow: "Registro completado",
      title: "¡Bienvenido a iTEC!",
      intro: `Hola <strong style="color:#ffffff">${escapeHtml(name || "Estudiante")}</strong>. Tu cuenta ya está lista para que puedas ingresar a la plataforma.`,
      content: `<div style="background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:12px;padding:18px 20px;color:${EMAIL_COLORS.text};font-size:14px;line-height:1.6">Ingresá con el correo que utilizaste durante el registro y descubrí publicaciones, avisos, calendario, recursos y todas las herramientas de la comunidad.</div>`,
      primaryLabel: "Iniciar sesión",
      primaryUrl: brand.webUrl,
      secondaryLabel: "Descargar",
      secondaryUrl: brand.downloadUrl,
      secondaryImageUrl: brand.downloadImageUrl,
    }),
  );
};

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

export const getAdminUsers = async (req, res, next) => {
  try {
    const snapshot = await dbFirebase.collection("users").where("role", "in", ["admin", "moderator"]).get();
    res.status(200).json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  } catch (err) {
    next(err);
  }
};

export const getAuthorizedUsers = async (req, res, next) => {
  try {
    const snapshot = await dbFirebase.collection("users_autorized").where("authorized", "==", true).get();
    res.status(200).json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
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
    if (!userRecord) {
      const snapshot = await dbFirebase
        .collection("users_autorized")
        .where("email", "==", String(email).trim().toLowerCase())
        .limit(1)
        .get();
      if (snapshot.empty) return next(notFound("Usuario no encontrado"));
      const authorizedDoc = snapshot.docs[0];
      return res.status(200).json({
        id: authorizedDoc.id,
        ...authorizedDoc.data(),
        isExternalAuthorization: true,
      });
    }

    const doc = await dbFirebase.collection("users").doc(userRecord.uid).get();
    const data = doc.exists ? doc.data() : {};

    res.status(200).json({
      id: userRecord.uid,
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

// POST /api/users/authorized — crear o actualizar una autorización externa
export const createAuthorizedUser = async (req, res, next) => {
  try {
    const { email, name = "Estudiante", role = "student", authorized = true } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return next(badRequest("Email inválido"));
    }
    if (role !== "student") {
      return next(badRequest("Las cuentas externas deben comenzar con el rol student"));
    }

    const snapshot = await dbFirebase
      .collection("users_autorized")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    const ref = snapshot.empty
      ? dbFirebase.collection("users_autorized").doc()
      : snapshot.docs[0].ref;

    await ref.set({
      name,
      email: normalizedEmail,
      role,
      authorized: authorized === true,
    }, { merge: true });

    res.status(snapshot.empty ? 201 : 200).json({ id: ref.id, email: normalizedEmail });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/authorized/:authorizationId — modificar autorización externa
export const updateAuthorizedUser = async (req, res, next) => {
  try {
    const { authorizationId } = req.params;
    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.authorized !== undefined) update.authorized = req.body.authorized === true;
    if (req.body.email !== undefined) update.email = String(req.body.email).trim().toLowerCase();

    if (!Object.keys(update).length) return next(badRequest("Sin datos para actualizar"));

    const ref = dbFirebase.collection("users_autorized").doc(authorizationId);
    const existing = await ref.get();
    if (!existing.exists) return next(notFound("Autorización no encontrada"));
    await ref.set(update, { merge: true });
    res.status(200).json({ id: authorizationId, ...update });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/authorized/:authorizationId — eliminar autorización externa
export const deleteAuthorizedUser = async (req, res, next) => {
  try {
    const { authorizationId } = req.params;
    const ref = dbFirebase.collection("users_autorized").doc(authorizationId);
    const existing = await ref.get();
    if (!existing.exists) return next(notFound("Autorización no encontrada"));
    await ref.delete();
    res.status(200).json({ message: "Autorización eliminada" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/:uid — eliminar cuenta institucional y su perfil
export const deleteUser = async (req, res, next) => {
  try {
    const { uid } = req.params;
    if (!uid) return next(badRequest("Usuario requerido"));
    if (uid === req.user.uid) return next(badRequest("No podés eliminar tu propia cuenta"));

    await authFirebase.deleteUser(uid);
    await dbFirebase.collection("users").doc(uid).delete();
    clearUserAuthCache(uid);
    usersCountCache = { total: null, timestamp: 0 };
    res.status(200).json({ message: "Usuario eliminado correctamente" });
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

    let welcomeEmailSent = false;
    try {
      welcomeEmailSent = await sendWelcomeEmail({
        email: normalized,
        name: displayName || "Estudiante",
      });
    } catch (emailError) {
      console.error("No se pudo enviar el email de bienvenida:", emailError?.message || emailError);
    }

    res.status(201).json({
      uid: userRecord.uid,
      email: normalized,
      welcomeEmailSent,
      message: welcomeEmailSent
        ? "Cuenta creada. Revisá tu correo para ingresar."
        : "Cuenta creada",
    });
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
    const roleDefinition = await Role.findOne({ key: role }).lean();
    if (!roleDefinition) return next(badRequest("Rol inválido o no configurado"));
    // Evitar que un administrador se quite sus privilegios accidentalmente,
    // pero permitir que un moderador conserve o reasigne su propio rol.
    if (
      uid === req.user.uid &&
      ["admin", "moderator"].includes(req.user.role) &&
      !["admin", "moderator"].includes(role)
    ) {
      return next(badRequest("No podés quitarte tus propios permisos administrativos"));
    }

    const userRef = dbFirebase.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const previousRole = userDoc.exists ? userDoc.data().role ?? "student" : "student";

    await userRef.set({ role }, { merge: true });
    clearUserAuthCache();

    let emailSent = false;
    let email = null;
    if (previousRole !== role) {
      try {
        const userRecord = await authFirebase.getUser(uid);
        email = userRecord.email || null;
        if (email) {
          emailSent = await sendRoleChangeEmail({
            email,
            name: userRecord.displayName || userDoc.data()?.name || "Estudiante",
            role,
            roleDefinition,
          });
        } else {
          console.warn(`No se envió aviso de cambio de rol: el usuario ${uid} no tiene email.`);
        }
      } catch (emailError) {
        console.error("No se pudo enviar el aviso de cambio de rol:", emailError?.message || emailError);
      }
    }

    res.status(200).json({
      uid,
      role,
      roleChanged: previousRole !== role,
      emailSent,
      message: emailSent ? "Rol actualizado y aviso enviado" : "Rol actualizado",
    });
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
