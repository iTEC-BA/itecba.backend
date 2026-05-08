import mongoose from "mongoose";

const aiContextSchema = new mongoose.Schema(
  {
    personality: { type: String, default: "Soy el asistente de ITEC BA, una plataforma estudiantil de la UTN Buenos Aires." },
    institutionalContext: { type: String, default: "UTN FRBA es la Facultad Regional Buenos Aires de la Universidad Tecnológica Nacional." },
    rules: [{ type: String }],
    singleton: { type: Boolean, default: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model("AIContext", aiContextSchema);
