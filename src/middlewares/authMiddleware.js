import { authFirebase, dbFirebase } from "../config/firebase-admin.js";
import { unauthorized, forbidden } from "./errorHandler.js";

// Cache en memoria para no consultar Firestore en cada request
const userRoleCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutos

const getCachedRole = async (uid) => {
  const cached = userRoleCache.get(uid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.role;

  const doc  = await dbFirebase.collection("users").doc(uid).get();
  const role = doc.exists ? doc.data().role ?? "student" : "student";
  userRoleCache.set(uid, { role, ts: Date.now() });
  return role;
};

export const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());

  try {
    const decoded = await authFirebase.verifyIdToken(header.split(" ")[1]);
    const role    = await getCachedRole(decoded.uid);
    req.user = { uid: decoded.uid, email: decoded.email, role };
    next();
  } catch (err) {
    // Distinguimos token expirado de token inválido
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
