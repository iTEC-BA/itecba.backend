// src/modules/points/pointLog.model.js
// Registro de cada otorgamiento. Sirve para auditoría y para
// verificar cooldown y tope diario sin consultar Firestore.
import mongoose from "mongoose";

const pointLogSchema = new mongoose.Schema(
  {
    // UID de Firebase del usuario que recibió los puntos
    uid:          { type: String, required: true, index: true },
    // Key de la actividad (ej: "forum_post")
    activityKey:  { type: String, required: true },
    // Puntos otorgados en este registro
    pointsAwarded: { type: Number, required: true },
    // Metadatos opcionales del contexto (postId, resourceId, etc.)
    context:      { type: mongoose.Schema.Types.Mixed, default: {} },
    // TTL: Mongoose + MongoDB TTL index borra automáticamente después de 90 días
    createdAt:    { type: Date, default: Date.now, expires: "90d" },
  },
  { timestamps: false }, // createdAt se define manualmente para el TTL
);

// Índice compuesto para consultas de cooldown y cap diario: uid + activityKey + createdAt
pointLogSchema.index({ uid: 1, activityKey: 1, createdAt: -1 });

export default mongoose.model("PointLog", pointLogSchema);
