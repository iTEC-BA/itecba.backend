import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    active: { type: Boolean, default: true },
    isCritical: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    audienceRoles: { type: [String], default: ["all"] },
    audienceCareers: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("Announcement", announcementSchema);
