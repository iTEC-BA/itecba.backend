import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    pointsCost: { type: Number, required: true },
    type: {
      type: String,
      enum: ["mentorship", "group_access", "discount"],
      required: true,
    },
    icon: { type: String, default: "star" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Reward = mongoose.model("Reward", rewardSchema);
