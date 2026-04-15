import Link from "./link.model.js";

export const getLinks = async (req, res, next) => {
  try {
    const links = await Link.find().sort({ order: 1 }).lean();
    res.status(200).json(links);
  } catch (error) {
    next(error);
  }
};

export const createLink = async (req, res, next) => {
  try {
    const { title, url } = req.body;
    if (!title || !url)
      throw Object.assign(new Error("Título y URL obligatorios"), {
        statusCode: 400,
      });

    const newLink = new Link(req.body);
    const savedLink = await newLink.save();
    res.status(201).json(savedLink);
  } catch (error) {
    next(error);
  }
};

export const updateLink = async (req, res, next) => {
  try {
    const link = await Link.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!link)
      throw Object.assign(new Error("Link no encontrado"), { statusCode: 404 });
    res.status(200).json(link);
  } catch (error) {
    next(error);
  }
};

export const deleteLink = async (req, res, next) => {
  try {
    const link = await Link.findByIdAndDelete(req.params.id);
    if (!link)
      throw Object.assign(new Error("Link no encontrado"), { statusCode: 404 });
    res.status(200).json({ message: "Link eliminado" });
  } catch (error) {
    next(error);
  }
};
