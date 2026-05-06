import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getApprovedResources,
  getPendingResources,
  createResource,
  approveResource,
  deleteResource,
} from "./resource.controller.js";

const router = Router();

const resourceValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("carrera").trim().notEmpty().withMessage("Carrera requerida"),
  body("nivel").trim().notEmpty().withMessage("Nivel requerido"),
  body("materia").trim().notEmpty().withMessage("Materia requerida"),
  body("tipo").trim().notEmpty().withMessage("Tipo requerido"),
  body("formato").trim().notEmpty().withMessage("Formato requerido"),
  body("link").trim().isURL().withMessage("Link debe ser una URL válida"),
];

router.get("/",             getApprovedResources);
router.post(
  "/",
  verifyToken,
  resourceValidators, validate,
  createResource
);
router.get("/pending",      verifyToken, requireAdmin, getPendingResources);
router.put("/:id/approve",  verifyToken, requireAdmin, approveResource);
router.delete("/:id",       verifyToken, requireAdmin, deleteResource);

export default router;
