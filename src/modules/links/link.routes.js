import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requirePermission } from "../../middlewares/authMiddleware.js";
import { getLinks, createLink, updateLink, deleteLink } from "./link.controller.js";
import {
  getSections, getAllSections, createSection, updateSection, deleteSection,
} from "./section.controller.js";

const router = Router();

const linkValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("url").trim().notEmpty().withMessage("URL requerida").custom((val) => { if(!val.startsWith("http") && !val.startsWith("/")) throw new Error("URL inválida"); return true; }),
  body("icon").trim().notEmpty().withMessage("Ícono requerido"),
  body("imageUrl").optional().isString(),
  body("sectionId").optional({ nullable: true }).isMongoId(),
  body("order").optional().isInt({ min: 0 }).toInt(),
];

const sectionValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("description").optional().isString(),
  body("displayType").optional().isIn(["chips", "stories", "carousel"]),
  body("audienceRoles").optional().isArray(),
  body("order").optional().isInt({ min: 0 }).toInt(),
  body("isActive").optional().isBoolean().toBoolean(),
];

router.get("/", getLinks);
router.get("/sections", getSections);
router.get("/sections/all", verifyToken, requirePermission("publications.manage"), getAllSections);
router.post("/sections", verifyToken, requirePermission("publications.manage"), sectionValidators, validate, createSection);
router.put("/sections/:id", verifyToken, requirePermission("publications.manage"), sectionValidators, validate, updateSection);
router.delete("/sections/:id", verifyToken, requirePermission("publications.manage"), deleteSection);
router.post("/",    verifyToken, requirePermission("publications.manage"), linkValidators, validate, createLink);
router.put("/:id",  verifyToken, requirePermission("publications.manage"), linkValidators, validate, updateLink);
router.delete("/:id", verifyToken, requirePermission("publications.manage"), deleteLink);

export default router;
