// src/modules/courses/course.model.js
import mongoose from "mongoose";

// ── Subdocumento: Video individual ──────────────────────────────────────────
const videoSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, trim: true },
    title:     { type: String, required: true, trim: true },
    duration:  { type: String, default: "0:00" },

    // Reportes de video roto (estudiantes)
    brokenReports: [
      {
        reportedBy: { type: String },          // Firebase UID
        reason:     { type: String, default: "no-reproduce" },
        createdAt:  { type: Date, default: Date.now },
      },
    ],
    // Flag para que el admin gestione sin borrar el documento
    isBroken: { type: Boolean, default: false },
  },
  { _id: true }
);

// ── Esquema principal del Curso ─────────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    imageUrl:    { type: String, default: "" },
    playlistId:  { type: String, default: "" },
    materia:     { type: String, default: "" },

    // Control de publicación: draft → approved → archived
    categoria: {
      type:    String,
      enum:    ["Oficial", "Comunidad"],
      default: "Comunidad",
    },
    status: {
      type:    String,
      enum:    ["draft", "approved", "archived"],
      default: "approved",     // Retrocompatibilidad con cursos existentes
    },

    videos: [videoSchema],

    // Creador del curso (UID Firebase del admin/creador)
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// Índices para búsquedas frecuentes
courseSchema.index({ status: 1 });
courseSchema.index({ materia: 1 });
courseSchema.index({ "videos.isBroken": 1 });

export default mongoose.model("Course", courseSchema);
