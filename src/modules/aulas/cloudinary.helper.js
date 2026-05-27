// src/modules/aulas/cloudinary.helper.js
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";

// Inicializar Cloudinary (necesita CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET en .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Comprime una imagen con Sharp y la sube a Cloudinary.
 * @param {Buffer} buffer   - Buffer de la imagen original
 * @param {string} folder   - Carpeta destino en Cloudinary (ej: "itecba/aulas/medrano/265")
 * @returns {Promise<string>} URL pública de la imagen subida
 */
export const compressAndUpload = async (buffer, folder) => {
  // Compresión: redimensionar a max 1200px, convertir a WebP calidad 80
  const compressed = await sharp(buffer)
    .resize({
      width: 600,
      height: 600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "webp",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      },
    );
    stream.end(compressed);
  });
};

/**
 * Elimina un recurso de Cloudinary por su URL pública.
 * @param {string} url - URL pública del recurso (https://res.cloudinary.com/...)
 */
export const deleteFromCloudinary = async (url) => {
  if (!url || !url.includes("cloudinary.com")) return;
  try {
    const parts = url.split("/");
    const filename = parts[parts.length - 1].split(".")[0];
    const folderPath = parts.slice(parts.indexOf("upload") + 2, -1).join("/");
    const publicId = folderPath ? `${folderPath}/${filename}` : filename;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("[Cloudinary] No se pudo eliminar el recurso:", err.message);
  }
};
