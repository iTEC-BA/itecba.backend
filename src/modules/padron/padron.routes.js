import { Router } from "express";
import { consultarPadron } from "./padron.controller.js";

const router = Router();

// Endpoint: POST /api/padron/consultar
router.post("/consultar", consultarPadron);

export default router;
