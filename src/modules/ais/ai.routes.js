import express from "express";
import { generateAIResponse } from "./ai.service.js";

const router = express.Router();

router.post("/chat", async (req, res, next) => {
  try {
    const { message, history } = req.body;
    const response = await generateAIResponse(message, history);
    res.json({ response });
  } catch (error) {
    next(error); // Tu errorHandler global se encargará del resto
  }
});

export default router;
