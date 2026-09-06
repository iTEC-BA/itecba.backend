import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const compressAndUploadCover = async (buffer) => {
  const compressed = await sharp(buffer)
    .resize(800, 450, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "portadas_courses", resource_type: "image", format: "webp" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(compressed);
  });
};
