import { Router } from "express";
import { handle } from "../../lib/http.js";
import { getAvailability } from "./availability.service.js";

export const availabilityRouter = Router();

availabilityRouter.get(
  "/",
  handle(async (req, res) => {
    const serviceId = Number(req.query.serviceId);
    const barberId = Number(req.query.barberId);
    const date = typeof req.query.date === "string" ? req.query.date : "";

    if (!Number.isInteger(serviceId) || !Number.isInteger(barberId) || !date) {
      res.status(400).json({ error: "serviceId, barberId, and date are required." });
      return;
    }

    const result = await getAvailability({ serviceId, barberId, date });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.data);
  }),
);
