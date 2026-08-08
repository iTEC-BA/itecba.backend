// src/modules/pageAccess/pageAccess.service.js
//
// Fuente única de la verdad: Firestore → config/pageAccess
// Estructura del documento:
// {
//   pages: {
//     "/trueketec": { enabled: true,  comingSoon: false, hidden: false, label: "TruekeTEC", updatedAt, updatedBy },
//     "/aulas":      { enabled: false, comingSoon: true,  hidden: false, label: "Buscar aula", updatedAt, updatedBy },
//     ...
//   }
// }
//
// Un único doc (no una colección) → una sola lectura para traer el estado
// de TODAS las páginas. El frontend se suscribe a este doc con onSnapshot
// y Firestore persistentLocalCache sirve el valor cacheado al instante,
// sin pedirle nada al backend en cada carga.
import { dbFirebase } from "../../config/firebase-admin.js";

const CONFIG_COLLECTION = "config";
const DOC_ID = "pageAccess";

const docRef = () => dbFirebase.collection(CONFIG_COLLECTION).doc(DOC_ID);

// Estado por defecto de una página no configurada aún: visible y habilitada.
const DEFAULT_PAGE_STATE = { enabled: true, comingSoon: false, hidden: false };

export const getPageAccessConfig = async () => {
  const snap = await docRef().get();
  if (!snap.exists) return { pages: {} };
  return snap.data();
};

export const upsertPageAccess = async (path, patch, adminUid) => {
  if (!path || typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("path inválido: debe ser una ruta que empiece con '/'");
  }

  const current = await getPageAccessConfig();
  const existing = current.pages?.[path] ?? { ...DEFAULT_PAGE_STATE, label: path };

  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid ?? null,
  };

  await docRef().set(
    { pages: { [path]: updated } },
    { merge: true },
  );

  return updated;
};

export const deletePageAccess = async (path) => {
  const current = await getPageAccessConfig();
  const pages = { ...(current.pages ?? {}) };
  delete pages[path];
  await docRef().set({ pages }, { merge: false });
};
