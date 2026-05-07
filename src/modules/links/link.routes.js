import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import { getLinks, createLink, updateLink, deleteLink } from "./link.controller.js";

const router = Router();

const linkValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("url").trim().notEmpty().withMessage("URL requerida").custom((val) => { if(!val.startsWith("http") && !val.startsWith("/")) throw new Error("URL inválida"); return true; }),
  body("icon").trim().notEmpty().withMessage("Ícono requerido"),
  body("order").optional().isInt({ min: 0 }).toInt(),
];

router.get("/", getLinks);
router.post("/",    verifyToken, requireAdmin, linkValidators, validate, createLink);
router.put("/:id",  verifyToken, requireAdmin, linkValidators, validate, updateLink);
router.delete("/:id", verifyToken, requireAdmin, deleteLink);

export default router;
