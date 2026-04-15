// Usamos 'export const' en lugar de 'module.exports'
export const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);

  // Si el error tiene un código de estado (ej: 400 Bad Request, 404 Not Found), lo usamos. Si no, 500.
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    error: true,
    message: err.message || "Error interno del servidor",
    // Ocultamos el stacktrace en producción por seguridad
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
