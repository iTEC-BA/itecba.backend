import mongoose from "mongoose";

const benefitSchema = new mongoose.Schema(
  {
    title:    { type: String, required: true, trim: true },
    discount: { type: String, required: true },
    location: { type: String, default: "-" },
    category: {
      type: String,
      enum: ["medrano", "campus", "digital"],
      required: true,
    },
    isActive:    { type: Boolean, default: true },
    description: { type: String, default: "" },
    logoUrl:     { type: String, default: "" },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Benefit = mongoose.model("Benefit", benefitSchema);
