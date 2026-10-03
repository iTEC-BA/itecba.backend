import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    displayType: {
      type: String,
      enum: ["chips", "stories", "carousel"],
      default: "chips",
    },
    audienceRoles: {
      type: [String],
      enum: ["all", "student", "ingresante", "afiliado", "profesor", "moderator", "admin"],
      default: ["all"],
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("LinkSection", sectionSchema);
