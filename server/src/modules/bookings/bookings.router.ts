import { Router } from "express";
import { handle } from "../../lib/http.js";
import { requireAuth, requireCustomer } from "../../middleware/auth.js";
import { createBooking, cancelBooking, listCustomerBookings } from "./bookings.service.js";

export const bookingsRouter = Router();

bookingsRouter.post(
  "/",
  requireAuth,
  requireCustomer,
  handle(async (req, res) => {
    const serviceId = Number(req.body?.serviceId);
    const barberId = Number(req.body?.barberId);
    const start = typeof req.body?.start === "string" ? req.body.start : "";
    const note = typeof req.body?.note === "string" ? req.body.note : "";
    const headerKey = req.header("Idempotency-Key");
    const bodyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const idempotencyKey = (headerKey?.trim() || bodyKey || "").slice(0, 80) || null;

    if (!Number.isInteger(serviceId) || !Number.isInteger(barberId) || !start) {
      res.status(400).json({ error: "serviceId, barberId, and start are required." });
      return;
    }

    const result = await createBooking({
      customerId: req.user!.id,
      serviceId,
      barberId,
      startIso: start,
      note,
      idempotencyKey,
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(result.status).json(result.data);
  }),
);

bookingsRouter.get(
  "/",
  requireAuth,
  requireCustomer,
  handle(async (req, res) => {
    const data = await listCustomerBookings(req.user!.id);
    res.json(data);
  }),
);

bookingsRouter.post(
  "/:id/cancel",
  requireAuth,
  requireCustomer,
  handle(async (req, res) => {
    const bookingId = Number(req.params.id);
    if (!Number.isInteger(bookingId)) {
      res.status(400).json({ error: "Booking id is required." });
      return;
    }

    const result = await cancelBooking({ customerId: req.user!.id, bookingId });
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }),
);
