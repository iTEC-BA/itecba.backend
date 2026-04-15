import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    carrera: { type: String, required: true },
    nivel: { type: String, required: true },
    materia: { type: String, required: true },
    comision: { type: String, required: true },
    link: { type: String, required: true },
    tipo: { type: String, enum: ["Oficial", "Alumnos"], default: "Alumnos" },
    submittedBy: { type: String }, // UID del usuario que lo subió
    isApproved: { type: Boolean, default: false }, // Para separar pendientes de aprobados
  },
  { timestamps: true },
);

export default mongoose.model("Group", groupSchema);
