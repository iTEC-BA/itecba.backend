// src/modules/points/activity.model.js
// Catálogo de actividades que otorgan puntos. Los admins editan
// estos documentos desde el panel; el código nunca hardcodea valores.
import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    // Identificador de texto usado en el código: "forum_post", "resource_upload", etc.
    key: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
      lowercase: true,
    },
    // Nombre visible en el panel de admin
    name: { type: String, required: true, trim: true },
    // Descripción interna para el admin
    description: { type: String, default: "" },
    // Puntos a otorgar por cada ocurrencia válida
    points: { type: Number, required: true, min: 0, default: 1 },
    // Minutos que deben pasar entre dos otorgamientos del mismo usuario
    // 0 = sin cooldown
    cooldownMinutes: { type: Number, default: 0, min: 0 },
    // Máximas veces que el mismo usuario puede ganar puntos por esta acción en 24h
    // 0 = sin límite diario
    dailyCap: { type: Number, default: 0, min: 0 },
    // Si está desactivada, la función de otorgamiento termina silenciosamente
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("PointActivity", activitySchema);
