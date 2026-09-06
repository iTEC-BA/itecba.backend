import mongoose from "mongoose";
import { normalizeStr } from "../../utils/normalize.js";

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, trim: true },
  description: { type: String, default: "" }, // NUEVO: Apuntes de clase en Markdown/LaTeX
  type: { type: String, enum: ["video", "exam", "article"], default: "video" },
  isPremium: { type: Boolean, default: false },
  youtubeId: { type: String, trim: true },
  mediaUrl: { type: String, trim: true },
  duration: { type: String, default: "0:00" },
  orderIndex: { type: Number, default: 0 },
  brokenReports: [
    {
      reportedBy: { type: String },
      reason: { type: String, default: "no-reproduce" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  isBroken: { type: Boolean, default: false },
});

const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  orderIndex: { type: Number, default: 0 },
  lessons: [lessonSchema],
});

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    playlistId: { type: String, default: "" },
    materia: { type: String, default: "" },
    // NUEVO: soporte para más de un profesor/docente a cargo del curso.
    profesores: { type: [{ type: String, trim: true }], default: [] },
    categoria: { type: String, enum: ["Oficial", "Comunidad"], default: "Comunidad" },
    status: { type: String, enum: ["draft", "approved", "archived"], default: "approved" },
    sections: [sectionSchema],
    createdBy: { type: String, default: "" },
    _searchable: { type: String, default: "" },
    videos: { type: Array, select: false } 
  },
  { timestamps: true }
);

courseSchema.pre("save", function () {
  const profesoresStr = Array.isArray(this.profesores) ? this.profesores.join(" ") : "";
  this._searchable = normalizeStr(`${this.title} ${this.description} ${this.materia} ${profesoresStr}`);
});

courseSchema.pre("findOneAndUpdate", function () {
  const upd = this.getUpdate();
  const title = upd?.title ?? upd?.$set?.title;
  const desc = upd?.description ?? upd?.$set?.description ?? "";
  const mat = upd?.materia ?? upd?.$set?.materia ?? "";
  const profesores = upd?.profesores ?? upd?.$set?.profesores ?? [];
  const profesoresStr = Array.isArray(profesores) ? profesores.join(" ") : "";
  if (title) {
    const searchable = normalizeStr(`${title} ${desc} ${mat} ${profesoresStr}`);
    if (upd.$set) upd.$set._searchable = searchable;
    else this.setUpdate({ ...upd, _searchable: searchable });
  }
});

courseSchema.index({ status: 1 });
courseSchema.index({ materia: 1 });
courseSchema.index({ _searchable: 1 });
courseSchema.index({ "sections.lessons.isBroken": 1 });
courseSchema.index({ createdAt: -1 });

export default mongoose.model("Course", courseSchema);
