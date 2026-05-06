import { validationResult } from "express-validator";

// Middleware que lee el resultado de express-validator y corta si hay errores
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:   true,
      message: "Datos de entrada inválidos",
      errors:  errors.array().map(({ path, msg }) => ({ field: path, msg })),
    });
  }
  next();
};
