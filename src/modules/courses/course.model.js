// src/modules/courses/course.model.js
import mongoose from "mongoose";
import { normalizeStr } from "../../utils/normalize.js";

// ── Subdocumento: Video individual ──────────────────────────────────────────
const videoSchema = new mongoose.Schema(
  {
    youtubeId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    duration: { type: String, default: "0:00" },

    // Reportes de video roto
    brokenReports: [
      {
        reportedBy: { type: String },
        reason: { type: String, default: "no-reproduce" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isBroken: { type: Boolean, default: false },
  },
  { _id: true },
);

// ── Esquema principal del Curso ─────────────────────────────────────────────
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    playlistId: { type: String, default: "" },
    materia: { type: String, default: "" },

    categoria: {
      type: String,
      enum: ["Oficial", "Comunidad"],
      default: "Comunidad",
    },
    status: {
      type: String,
      enum: ["draft", "approved", "archived"],
      default: "approved",
    },

    videos: [videoSchema],

    createdBy: { type: String, default: "" },

    /**
     * Campo desnormalizado para búsquedas rápidas sin tildes.
     * Se regenera automáticamente en cada save.
     * Ejemplo: "algebra y geometria analitica"
     */
    _searchable: { type: String, default: "" }, // ✅ Se eliminó `index: true` duplicado
  },
  { timestamps: true },
);

// ── Pre-save: actualiza _searchable ─────────────────────────────────────────
// ✅ Se eliminó el parámetro `next` y la llamada `next()`
courseSchema.pre("save", function () {
  this._searchable = normalizeStr(
    `${this.title} ${this.description} ${this.materia}`,
  );
});

// ── Pre-findOneAndUpdate: actualiza _searchable en updates ───────────────────
// ✅ Se eliminó el parámetro `next` y la llamada `next()`
courseSchema.pre("findOneAndUpdate", function () {
  const upd = this.getUpdate();
  const title = upd?.title ?? upd?.$set?.title;
  const desc = upd?.description ?? upd?.$set?.description ?? "";
  const mat = upd?.materia ?? upd?.$set?.materia ?? "";

  if (title) {
    const searchable = normalizeStr(`${title} ${desc} ${mat}`);
    if (upd.$set) upd.$set._searchable = searchable;
    else this.setUpdate({ ...upd, _searchable: searchable });
  }
});

// ── Índices ─────────────────────────────────────────────────────────────────
courseSchema.index({ status: 1 });
courseSchema.index({ materia: 1 });
courseSchema.index({ _searchable: 1 }); // búsqueda normalizada
courseSchema.index({ "videos.isBroken": 1 });
courseSchema.index({ createdAt: -1 });

export default mongoose.model("Course", courseSchema);
