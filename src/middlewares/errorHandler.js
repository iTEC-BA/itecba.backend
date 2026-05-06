// Clases de error con semántica HTTP clara
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
export const notFound = (message = "Recurso no encontrado") =>
  new AppError(message, 404);
export const badRequest = (message = "Datos inválidos") =>
  new AppError(message, 400);
export const unauthorized = (message = "No autorizado") =>
  new AppError(message, 401);
export const forbidden = (message = "Acceso denegado") =>
  new AppError(message, 403);

// Manejador global de errores — siempre va ÚLTIMO en index.js
export const errorHandler = (err, req, res, _next) => {
  // Errores de validación de Mongoose
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: true, message: messages.join(", ") });
  }
  // ID de Mongo con formato inválido
  if (err.name === "CastError") {
    return res.status(400).json({ error: true, message: "ID inválido" });
  }
  // Clave duplicada (unique index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(", ");
    return res
      .status(409)
      .json({ error: true, message: `El campo '${field}' ya existe` });
  }

  const statusCode = err.statusCode || 500;
  const message    = err.isOperational ? err.message : "Error interno del servidor";

  if (!err.isOperational) {
    console.error(`[UNEXPECTED ERROR] ${req.method} ${req.path}`, err);
  }

  res.status(statusCode).json({
    error:   true,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
