import Link from "./link.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

export const getLinks = async (req, res, next) => {
  try {
    const links = await Link.find().sort({ order: 1 }).select("-__v").lean();
    res.status(200).json(links);
  } catch (err) {
    next(err);
  }
};

export const createLink = async (req, res, next) => {
  try {
    const doc = await Link.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

export const updateLink = async (req, res, next) => {
  try {
    const doc = await Link.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return next(notFound("Link no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

export const deleteLink = async (req, res, next) => {
  try {
    const doc = await Link.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Link no encontrado"));
    res.status(200).json({ message: "Link eliminado" });
  } catch (err) {
    next(err);
  }
};
