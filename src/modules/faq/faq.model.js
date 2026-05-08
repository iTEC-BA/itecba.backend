import mongoose from "mongoose";

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    keywords: [{ type: String, lowercase: true, trim: true }],
    category: { type: String, default: "general", lowercase: true },
    popularity: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true },
);

// Índice de texto para búsqueda
faqSchema.index({ question: "text", answer: "text", keywords: "text" });

export default mongoose.model("FAQ", faqSchema);
