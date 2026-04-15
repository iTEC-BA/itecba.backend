import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    carrera: { type: String, required: true },
    nivel: { type: String, required: true },
    materia: { type: String, required: true },
    tipo: { type: String, required: true },
    formato: { type: String, required: true },
    link: { type: String, required: true },
    autor: { type: String, default: "Comunidad ITEC" },
    submittedBy: { type: String }, // UID de Firebase
    isApproved: { type: Boolean, default: false }, // Para la cola de moderación
  },
  { timestamps: true },
);

export default mongoose.model("Resource", resourceSchema);
