import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    expiresAt: { type: Date, required: true }, // Se borrarán solos o dejarán de mostrarse pasada esta fecha
  },
  { timestamps: true },
);

export default mongoose.model("Announcement", announcementSchema);
