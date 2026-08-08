// src/modules/pageAccess/pageAccess.controller.js
import {
  getPageAccessConfig,
  upsertPageAccess,
  deletePageAccess,
} from "./pageAccess.service.js";

// Con la ruta "/{*path}" (Express 5 / path-to-regexp v8), req.params.path
// llega como ARRAY de segmentos (ej: ["admin", "dashboard"]), no como string.
// Esta función lo normaliza a "/admin/dashboard".
const resolvePath = (req) => {
  const raw = req.params.path;
  const segments = Array.isArray(raw) ? raw : [raw];
  const decoded = segments.map((s) => decodeURIComponent(s)).join("/");
  return `/${decoded}`;
};

// GET /api/page-access
// Devuelve el documento completo { pages: { "/ruta": {...}, ... } }
// Uso pensado para consumidores que no puedan usar el SDK de Firestore
// directamente (ej. scripts, apps externas). El frontend web usa Firestore
// onSnapshot directo, no este endpoint, para evitar peticiones repetidas.
export const getAllPageAccess = async (_req, res, next) => {
  try {
    const config = await getPageAccessConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
};

// PUT /api/page-access/admin/dashboard  (o cualquier ruta con barras)
// Body: { enabled?, comingSoon?, hidden?, label? }
export const setPageAccess = async (req, res, next) => {
  try {
    const path = resolvePath(req);
    const { enabled, comingSoon, hidden, label } = req.body;

    const patch = {};
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (typeof comingSoon === "boolean") patch.comingSoon = comingSoon;
    if (typeof hidden === "boolean") patch.hidden = hidden;
    if (typeof label === "string") patch.label = label;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: true, message: "Nada para actualizar" });
    }

    const updated = await upsertPageAccess(path, patch, req.user?.uid);
    res.json({ path, ...updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/page-access/admin/dashboard
// Elimina la config custom de una página (vuelve al estado por defecto: habilitada).
export const removePageAccess = async (req, res, next) => {
  try {
    const path = resolvePath(req);
    await deletePageAccess(path);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
