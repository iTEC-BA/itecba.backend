import mongoose from "mongoose";

const redemptionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userEmail: { type: String, required: true },
    rewardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
      required: true,
    },
    rewardTitle: { type: String, required: true },
    pointsCost: { type: Number, required: true },
    payload: { type: Object, default: {} },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true },
);

export const Redemption = mongoose.model("Redemption", redemptionSchema);
