import { authFirebase, dbFirebase } from "../config/firebase-admin.js";
import { unauthorized, forbidden } from "./errorHandler.js";

// Cache en memoria para no consultar Firestore en cada request
const userAuthCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutos

const getCachedUserAuth = async (uid, email) => {
  const cached = userAuthCache.get(uid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;

  const doc = await dbFirebase.collection("users").doc(uid).get();
  
  const isInstitutional = email?.endsWith("@frba.utn.edu.ar");
  // Un usuario está autorizado si tiene correo institucional 
  // O si fue habilitado externamente (tiene documento creado en Firestore por el admin)
  const isAuthorized = isInstitutional || doc.exists;
  
  const role = doc.exists ? doc.data().role ?? "student" : "student";
  
  const authData = { role, isAuthorized, ts: Date.now() };
  userAuthCache.set(uid, authData);
  return authData;
};

export const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());

  try {
    const decoded = await authFirebase.verifyIdToken(header.split(" ")[1]);
    const authData = await getCachedUserAuth(decoded.uid, decoded.email);

    // Acá está la magia de la Opción 2: El backend toma la decisión final de acceso.
    if (!authData.isAuthorized) {
      return next(forbidden("Acceso restringido. Utilice una cuenta institucional (@frba.utn.edu.ar) o solicite habilitación al administrador."));
    }

    req.user = { uid: decoded.uid, email: decoded.email, role: authData.role };
    next();
  } catch (err) {
    const message =
      err.code === "auth/id-token-expired"
        ? "Token expirado. Volvé a iniciar sesión."
        : "Token inválido.";
    next(unauthorized(message));
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return next(forbidden());
  next();
};
