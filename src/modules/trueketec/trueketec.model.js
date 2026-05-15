// src/modules/trueketec/trueketec.model.js
import mongoose from "mongoose";

// ── Sub-esquema: postulación de un interesado ─────────────────────────────
const postulacionSchema = new mongoose.Schema(
  {
    userId:    { type: String, required: true },
    userEmail: { type: String, required: true, trim: true },
    userName:  { type: String, default: "Estudiante" },
  },
  { _id: false, timestamps: true }
);

// ── Esquema principal ─────────────────────────────────────────────────────
const trueketecSchema = new mongoose.Schema(
  {
    // ── Autor ─────────────────────────────────────────────────────────────
    userId:    { type: String, required: true },
    userEmail: { type: String, required: true, trim: true },
    userName:  { type: String, default: "Estudiante", trim: true },

    // ── Datos de la solicitud ─────────────────────────────────────────────
    departamento:     { type: String, required: true, trim: true },
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

    // ── Estado (NO se borra: sólo cambia de estado) ────────────────────
    estado: {
      type:    String,
      enum:    ["Activo", "En Negociación", "Trueque Realizado"],
      default: "Activo",
      index:   true,
    },

    // ── Interesados que se postularon ─────────────────────────────────
    postulaciones: {
      type:    [postulacionSchema],
      default: [],
    },

    // ── Contacto revelado (tras acuerdo) ─────────────────────────────
    matchedWith:  { type: String, default: null },
    matchedEmail: { type: String, default: null },

    // ── TTL automático (21 días) ──────────────────────────────────────
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Índices compuestos para las queries más frecuentes ─────────────────────
trueketecSchema.index({ estado: 1, materia: 1 });
trueketecSchema.index({ estado: 1, departamento: 1 });
trueketecSchema.index({ estado: 1, comision_actual: 1 });
trueketecSchema.index({ userId: 1, estado: 1 });
trueketecSchema.index({ estado: 1, comision_actual: 1, comision_deseada: 1, materia: 1 });
trueketecSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

export default mongoose.model("Trueketec", trueketecSchema);
