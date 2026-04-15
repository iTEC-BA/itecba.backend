import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  youtubeId: { type: String, required: true },
  title: { type: String, required: true },
  duration: { type: String, required: true },
});

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    playlistId: { type: String },
    videos: [videoSchema], // Array de videos dentro del curso
  },
  { timestamps: true },
);

export default mongoose.model("Course", courseSchema);
