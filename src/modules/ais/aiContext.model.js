// src/modules/ais/aiContext.model.js
import mongoose from "mongoose";

const aiContextSchema = new mongoose.Schema(
  {
    personality: {
      type:    String,
      default: "Soy el asistente de ITEC BA, una plataforma estudiantil de la UTN Buenos Aires.",
    },
    institutionalContext: {
      type:    String,
      default: "UTN FRBA es la Facultad Regional Buenos Aires de la Universidad Tecnológica Nacional.",
    },
    rules: [{ type: String }],
    // Costo en puntos por consulta IA avanzada (configurable desde el admin)
    aiCost: {
      type:    Number,
      default: 2,
      min:     1,
    },
    singleton: { type: Boolean, default: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model("AIContext", aiContextSchema);
