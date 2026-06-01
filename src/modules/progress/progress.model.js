import { dbFirebase } from "../../config/firebase-admin.js";

const COLLECTION = "progress";

const docRef = (uid) => dbFirebase.collection(COLLECTION).doc(uid);

export const getRawProgress = async (uid) => {
  const snap = await docRef(uid).get();
  return snap.exists ? snap.data() : null;
};

export const upsertProgress = async (uid, payload) => {
  await docRef(uid).set(payload, { merge: true });
};

export const setSubjectEntry = async (uid, codigo, value) => {
  const admin = await import("firebase-admin");
  const FieldValue = admin.default.firestore.FieldValue;

  // CORRECCIÓN 1: Se usa un objeto anidado en vez de dot notation
  // para que { merge: true } fusione los datos correctamente dentro del mapa 'p'
  const updatePayload = {
    p: {
      [codigo]: value === null || value === undefined ? FieldValue.delete() : value
    }
  };

  await docRef(uid).set(updatePayload, { merge: true });
};

export const updateMeta = async (uid, fields) => {
  await docRef(uid).set(fields, { merge: true });
};
