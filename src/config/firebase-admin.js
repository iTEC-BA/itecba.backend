import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// Construimos el objeto de credenciales usando las variables de entorno
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Reemplazamos los escapes de saltos de línea para que el SDK los lea bien
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const dbFirebase = admin.firestore();
export const authFirebase = admin.auth();

console.log("🟢 Firebase Admin Conectado Correctamente (vía ENV)");
