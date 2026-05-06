import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

// Validación temprana de variables críticas
const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`🔴 Variable de entorno faltante: ${key}`);
    process.exit(1);
  }
}

// Inicializar solo si no hay instancia activa (útil en hot-reload)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const dbFirebase   = admin.firestore();
export const authFirebase = admin.auth();
console.log("🟢 Firebase Admin conectado");
