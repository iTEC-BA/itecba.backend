// src/modules/trueketec/trueketec.model.js
import mongoose from "mongoose";

const trueketecSchema = new mongoose.Schema(
  {
    // ── Autor ──────────────────────────────────────────────
    userId:    { type: String, required: true },          // Firebase UID
    userEmail: { type: String, required: true, trim: true }, // @frba.utn.edu.ar

    // ── Datos de la solicitud ──────────────────────────────
    materia:          { type: String, required: true, trim: true },
    comision_actual:  { type: String, required: true, trim: true },
    turno_actual: {
      type: String,
      enum: ["Mañana", "Tarde", "Noche"],
      required: true,
    },
    comision_deseada: { type: String, required: true, trim: true }, // o "Cualquiera"
    turno_deseado: {
      type: String,
      enum: ["Mañana", "Tarde", "Noche", "Cualquiera"],
      required: true,
    },

    // ── Estado ────────────────────────────────────────────
    estado: {
      type: String,
      enum: ["activo", "completado"],
      default: "activo",
    },

    // ── Contacto revelado (sólo cuando ambas partes aceptan) ──
    matchedWith: { type: String, default: null },    // userId del match
    matchedEmail: { type: String, default: null },   // email del match

    // ── Expiración automática ─────────────────────────────
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índices para queries frecuentes
trueketecSchema.index({ estado: 1 });
trueketecSchema.index({ materia: 1, estado: 1 });
trueketecSchema.index({ userId: 1 });
trueketecSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model("Trueketec", trueketecSchema);
