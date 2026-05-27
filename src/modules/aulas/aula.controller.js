// src/modules/aulas/aula.controller.js
import Aula, { toSlug, FUNCIONES, SEDES } from "./aula.model.js";
import { compressAndUpload, deleteFromCloudinary } from "./cloudinary.helper.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import mongoose from "mongoose";

// ── GET /api/aulas — público, filtra por sede/función, payload reducido ───────
export const getAulas = async (req, res, next) => {
  try {
    const filter = { activo: true };
    if (req.query.sede    && SEDES.includes(req.query.sede))       filter.sede    = req.query.sede;
    if (req.query.funcion && FUNCIONES.includes(req.query.funcion)) filter.funcion = req.query.funcion;

    const aulas = await Aula.find(filter)
      .select("-imagenes -videos -referencias -__v")
      .sort({ sede: 1, piso: 1, numero: 1 })
      .lean();

    // "versión" como el updatedAt más reciente: el frontend la compara con su caché.
    const version = aulas.reduce((max, a) => {
      const ts = new Date(a.updatedAt).getTime();
      return ts > max ? ts : max;
    }, 0);

    res.status(200).json({ aulas, version: new Date(version || Date.now()).toISOString() });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/aulas/all — admin, incluye inactivas ─────────────────────────────
export const getAllAulas = async (req, res, next) => {
  try {
    const aulas = await Aula.find()
      .select("-__v")
      .sort({ sede: 1, piso: 1, numero: 1 })
      .lean();
    res.status(200).json({ aulas });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/aulas/:identificador — público, detalle completo ─────────────────
// El identificador puede ser el _id de MongoDB o el slug del aula
export const getAula = async (req, res, next) => {
  try {
    const { identificador } = req.params;
    const isObjectId = mongoose.isValidObjectId(identificador);

    const aula = await Aula.findOne(
      isObjectId
        ? { _id: identificador, activo: true }
        : { slug: identificador, activo: true }
    )
      .select("-__v")
      .lean();

    if (!aula) return next(notFound("Aula no encontrada"));
    res.status(200).json({ aula });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/aulas — admin ───────────────────────────────────────────────────
export const createAula = async (req, res, next) => {
  try {
    const {
      numero, sede, piso, funcion,
      pasillo, ala, capacidad, carrera,
      descripcion, referencias, videos,
    } = req.body;

    const aula = await Aula.create({
      numero, sede, piso: Number(piso), funcion,
      pasillo, ala, carrera, descripcion, referencias,
      capacidad: capacidad ? Number(capacidad) : undefined,
      videos: Array.isArray(videos) ? videos.slice(0, 3) : [],
    });

    res.status(201).json({ aula });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/aulas/:id — admin, actualización parcial ──────────────────────
export const updateAula = async (req, res, next) => {
  try {
    const ALLOWED = [
      "numero", "sede", "piso", "funcion",
      "pasillo", "ala", "capacidad", "carrera",
      "descripcion", "referencias", "activo", "videos",
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) return next(badRequest("Sin campos para actualizar"));
    if (update.piso      !== undefined) update.piso      = Number(update.piso);
    if (update.capacidad !== undefined) update.capacidad = Number(update.capacidad);
    if (update.videos)                  update.videos    = update.videos.slice(0, 3);

    // Si se actualiza el numero, regenerar slug
    if (update.numero) {
      const base = toSlug(update.numero);
      let candidate = base;
      let suffix = 1;
      while (await Aula.exists({ slug: candidate, _id: { $ne: req.params.id } })) {
        candidate = `${base}-${suffix++}`;
      }
      update.slug = candidate;
    }

    const aula = await Aula.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!aula) return next(notFound("Aula no encontrada"));
    res.status(200).json({ aula });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/aulas/:id — admin, soft delete ────────────────────────────────
export const deleteAula = async (req, res, next) => {
  try {
    const aula = await Aula.findByIdAndUpdate(
      req.params.id,
      { activo: false },
      { new: true }
    );
    if (!aula) return next(notFound("Aula no encontrada"));
    res.status(200).json({ message: "Aula desactivada", aula });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/aulas/:id/media — admin, subir imágenes ────────────────────────
export const uploadMedia = async (req, res, next) => {
  try {
    const aula = await Aula.findById(req.params.id);
    if (!aula) return next(notFound("Aula no encontrada"));

    const files = req.files ?? [];
    if (files.length === 0) return next(badRequest("No se recibieron archivos"));

    const remaining = 10 - aula.imagenes.length;
    if (remaining <= 0) return next(badRequest("Límite de 10 imágenes alcanzado para esta aula"));

    const toProcess = files.slice(0, remaining);
    const folder    = `itecba/aulas/${aula.sede}/${toSlug(aula.numero)}`;

    const urls = await Promise.all(
      toProcess.map((file) => compressAndUpload(file.buffer, folder))
    );

    aula.imagenes.push(...urls);
    await aula.save();

    res.status(200).json({ aula, uploaded: urls.length });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/aulas/:id/media — admin, eliminar imagen o video ──────────────
export const deleteMedia = async (req, res, next) => {
  try {
    const { tipo, url } = req.body;
    if (!tipo || !url) return next(badRequest("Faltan campos: tipo y url"));
    if (!["imagen", "video"].includes(tipo)) return next(badRequest("tipo debe ser 'imagen' o 'video'"));

    const aula = await Aula.findById(req.params.id);
    if (!aula) return next(notFound("Aula no encontrada"));

    if (tipo === "imagen") {
      const idx = aula.imagenes.indexOf(url);
      if (idx === -1) return next(notFound("Imagen no encontrada en el aula"));
      aula.imagenes.splice(idx, 1);
      await deleteFromCloudinary(url);
    } else {
      const idx = aula.videos.indexOf(url);
      if (idx === -1) return next(notFound("Video no encontrado en el aula"));
      aula.videos.splice(idx, 1);
      await deleteFromCloudinary(url);
    }

    await aula.save();
    res.status(200).json({ aula });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/aulas/:id/media/video — admin, agregar link de video externo ────
export const addVideoUrl = async (req, res, next) => {
  try {
    const { url } = req.body;

    const aula = await Aula.findById(req.params.id);
    if (!aula) return next(notFound("Aula no encontrada"));

    if (aula.videos.length >= 3)
      return next(badRequest("Límite de 3 videos alcanzado para esta aula"));

    if (aula.videos.includes(url))
      return next(badRequest("Ese link ya está agregado a esta aula"));

    aula.videos.push(url);
    await aula.save();

    res.status(200).json({ aula });
  } catch (err) {
    next(err);
  }
};
