import { authFirebase, dbFirebase } from "../config/firebase-admin.js";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado. Falta el token." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await authFirebase.verifyIdToken(token);
    const userDoc = await dbFirebase
      .collection("users")
      .doc(decodedToken.uid)
      .get();
    const userData = userDoc.exists ? userDoc.data() : { role: "student" };

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userData.role,
    };
    next();
  } catch (error) {
    // 🔴 AHORA IMPRIMIRÁ LA VERDAD EN TU CONSOLA DE NODE.JS
    console.error("🔥 ERROR DE FIREBASE ADMIN AL VERIFICAR TOKEN:");
    console.error(error);

    res.status(401).json({
      error: "Token inválido o expirado.",
      detalles: error.message,
    });
  }
};
// Middleware para rutas exclusivas de Admin
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Acceso denegado. Se requiere rol de Administrador." });
  }
  next();
};
