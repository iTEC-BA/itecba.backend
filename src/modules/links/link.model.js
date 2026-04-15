import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    icon: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("Link", linkSchema);
