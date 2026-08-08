import mongoose from "mongoose";

const benefitSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    discount: { type: String, default: "" },
    location: { type: String, default: "-" },
    category: {
      type: String,
      enum: ["medrano", "campus", "digital"],
      default: "medrano",
    },
    img: { type: String, default: "" },
    icon: { type: String, default: "gift" },
    pointsCost: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

benefitSchema.index({ isActive: 1, pointsCost: 1, order: 1 });

export const Benefit = mongoose.model("Benefit", benefitSchema);
