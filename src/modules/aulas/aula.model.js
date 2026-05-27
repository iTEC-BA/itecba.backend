// src/modules/aulas/aula.model.js
import mongoose from "mongoose";

export const FUNCIONES = [
  "aula_comun",
  "laboratorio_informatica",
  "laboratorio_especialidad",
  "departamento",
  "bedelia",
  "ceit",
  "sala_reunion",
  "secretaria",
  "otro",
];

export const SEDES = ["medrano", "campus"];

/** Normaliza un texto a slug URL-safe: "Lab A" → "lab-a", "Bedelía" → "bedelia" */
export const toSlug = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-z0-9]+/g, "-") // reemplaza no-alfanumérico por guión
    .replace(/^-+|-+$/g, ""); // trim guiones extremos

const aulaSchema = new mongoose.Schema(
  {
    // ── Campos obligatorios ──────────────────────────────────────────────────
    numero: {
      type: String,
      required: [true, "El número/nombre del aula es requerido"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    sede: {
      type: String,
      enum: {
        values: SEDES,
        message: "Sede inválida. Debe ser: medrano, campus",
      },
      required: [true, "La sede es requerida"],
    },
    piso: {
      type: Number,
      required: [true, "El piso es requerido"],
    },
    funcion: {
      type: String,
      enum: { values: FUNCIONES, message: "Función inválida" },
      required: [true, "La función del espacio es requerida"],
    },

    // ── Campos opcionales ────────────────────────────────────────────────────
    pasillo: { type: String, trim: true, default: "" },
    ala: { type: String, trim: true, default: "" },
    capacidad: { type: Number, min: 0 },
    carrera: { type: String, trim: true, default: "" },
    descripcion: { type: String, trim: true, default: "" },
    referencias: { type: String, trim: true, default: "" },

    // ── Medios ───────────────────────────────────────────────────────────────
    imagenes: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "Máximo 10 imágenes por aula",
      },
      default: [],
    },
    videos: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 3,
        message: "Máximo 3 videos por aula",
      },
      default: [],
    },

    // ── Estado ───────────────────────────────────────────────────────────────
    activo: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// ── Índices compuestos para filtrado eficiente ────────────────────────────────
aulaSchema.index({ sede: 1, funcion: 1 });
aulaSchema.index({ sede: 1, activo: 1 });

// ── Auto-generar slug único antes de guardar ──────────────────────────────────
aulaSchema.pre("save", async function () {
  if (!this.isModified("numero") && this.slug) return;

  const base = toSlug(this.numero);
  let candidate = base;
  let suffix = 1;

  while (
    await mongoose
      .model("Aula")
      .exists({ slug: candidate, _id: { $ne: this._id } })
  ) {
    candidate = `${base}-${suffix++}`;
  }
  this.slug = candidate;
  // (async hook: no se llama a next())
});

export default mongoose.model("Aula", aulaSchema);