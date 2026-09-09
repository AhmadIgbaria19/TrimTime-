import { DateTime } from "luxon";
import { pool } from "../../db/pool.js";
import { handle } from "../../lib/http.js";
import { normalizePhone } from "../../lib/phone.js";
import { actionsFor, evaluateAdminAction, type AdminBookingAction } from "../bookings/admin-actions.js";
import { createBooking } from "../bookings/bookings.service.js";
import { evaluateCancel, type BookingStatus } from "../bookings/cancel-policy.js";
import { expireDuePending } from "../bookings/expire-pending.js";
import { expirePendingRowIfDue } from "../bookings/expire-pending-row.js";
import type { Router } from "express";

type AdminBookingRow = {
  id: number;
  status: BookingStatus;
  service_id: number;
  barber_id: number;
  service_name: string;
  barber_name: string;
  start_at: Date;
  end_at: Date;
  duration_minutes: number;
  price_ils: number;
  note: string;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  cancelled_by_role: "customer" | "admin" | null;
  cancelled_reason: string;
};

function mapAdminBooking(row: AdminBookingRow, timeZone: string, cancellationHours: number, now: DateTime) {
  const start = DateTime.fromJSDate(row.start_at).setZone(timeZone);
  const decision = evaluateCancel({
    status: row.status,
    startAt: start,
    now,
    cancellationHours,
  });
  return {
    id: row.id,
    status: row.status,
    serviceId: row.service_id,
    barberId: row.barber_id,
    serviceName: row.service_name,
    barberName: row.barber_name,
    start: DateTime.fromJSDate(row.start_at).toUTC().toISO() ?? "",
    end: DateTime.fromJSDate(row.end_at).toUTC().toISO() ?? "",
    localDate: start.toISODate() ?? "",
    localTime: start.toFormat("HH:mm"),
    localEndTime: DateTime.fromJSDate(row.end_at).setZone(timeZone).toFormat("HH:mm"),
    durationMinutes: row.duration_minutes,
    priceIls: row.price_ils,
    note: row.note,
    cancellable: decision.allowed,
    cancelledBy: row.cancelled_by_role,
    cancelledReason: row.cancelled_reason || "",
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    isGuest: row.customer_id === null,
    actions: actionsFor(row.status, start, now),
  };
}

const SELECT_SQL = `
  SELECT b.id, b.status, b.service_id, b.barber_id, b.service_name, b.barber_name,
         b.start_at, b.end_at, b.duration_minutes, b.price_ils, b.note, b.customer_id,
         b.cancelled_by_role, b.cancelled_reason,
         COALESCE(u.name, b.guest_name) AS customer_name,
         COALESCE(u.phone, b.guest_phone) AS customer_phone
  FROM bookings b
  LEFT JOIN users u ON u.id = b.customer_id
`;

async function salonSettings() {
  const salon = await pool.query<{ timezone: string; cancellation_hours: number }>(
    "SELECT timezone, cancellation_hours FROM salon_settings WHERE id = 1",
  );
  return {
    timeZone: salon.rows[0]?.timezone || "Asia/Jerusalem",
    cancellationHours: salon.rows[0]?.cancellation_hours ?? 2,
  };
}

export function registerAdminBookingRoutes(router: Router) {
  router.get(
    "/customers",
    handle(async (req, res) => {
      const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const phone = normalizePhone(raw);
      const like = raw ? `%${raw}%` : null;
      const result = await pool.query<{ id: number; name: string; phone: string }>(
        `SELECT id, name, phone
         FROM users
         WHERE role = 'customer'
           AND (
             $1::text IS NULL
             OR name ILIKE $1
             OR phone ILIKE $1
             OR ($2::text IS NOT NULL AND phone = $2)
           )
         ORDER BY name ASC, id ASC
         LIMIT 100`,
        [like, phone],
      );
      res.json({ customers: result.rows });
    }),
  );

  router.get(
    "/bookings",
    handle(async (_req, res) => {
      await expireDuePending();
      const { timeZone, cancellationHours } = await salonSettings();
      const now = DateTime.now().setZone(timeZone);
      const result = await pool.query<AdminBookingRow>(`${SELECT_SQL} ORDER BY b.start_at DESC, b.id DESC`);
      res.json({
        cancellationHours,
        bookings: result.rows.map((row) => mapAdminBooking(row, timeZone, cancellationHours, now)),
      });
    }),
  );

  router.post(
    "/bookings",
    handle(async (req, res) => {
      const rawCustomerId = req.body?.customerId;
      const customerId =
        rawCustomerId === null || rawCustomerId === "" || rawCustomerId === undefined
          ? null
          : Number(rawCustomerId);
      const serviceId = Number(req.body?.serviceId);
      const barberId = Number(req.body?.barberId);
      const start = typeof req.body?.start === "string" ? req.body.start : "";
      const note = typeof req.body?.note === "string" ? req.body.note : "";
      const guestName = typeof req.body?.guestName === "string" ? req.body.guestName : "";
      const guestPhone = typeof req.body?.guestPhone === "string" ? req.body.guestPhone : "";
      const headerKey = req.header("Idempotency-Key");
      const bodyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
      const idempotencyKey = (headerKey?.trim() || bodyKey || "").slice(0, 80) || null;

      if (!Number.isInteger(serviceId) || !Number.isInteger(barberId) || !start) {
        res.status(400).json({ error: "serviceId, barberId, and start are required." });
        return;
      }
      if (customerId !== null && !Number.isInteger(customerId)) {
        res.status(400).json({ error: "Choose a customer account or enter visitor details." });
        return;
      }

      if (customerId !== null) {
        const customer = await pool.query<{ id: number; role: string }>(
          "SELECT id, role FROM users WHERE id = $1",
          [customerId],
        );
        if (!customer.rows[0] || customer.rows[0].role !== "customer") {
          res.status(400).json({ error: "Choose a customer account. Admin accounts cannot be booked as the visitor." });
          return;
        }
      }

      const created = await createBooking({
        customerId,
        guestName: customerId ? undefined : guestName,
        guestPhone: customerId ? undefined : guestPhone,
        serviceId,
        barberId,
        startIso: start,
        note,
        idempotencyKey,
        status: "Confirmed",
      });
      if ("error" in created) {
        res.status(created.status).json({ error: created.error });
        return;
      }

      const { timeZone, cancellationHours } = await salonSettings();
      const now = DateTime.now().setZone(timeZone);
      const found = await pool.query<AdminBookingRow>(`${SELECT_SQL} WHERE b.id = $1`, [created.data.id]);
      res.status(created.status).json(mapAdminBooking(found.rows[0], timeZone, cancellationHours, now));
    }),
  );

  router.post(
    "/bookings/:id/:action",
    handle(async (req, res) => {
      const bookingId = Number(req.params.id);
      const action = req.params.action as AdminBookingAction;
      if (!Number.isInteger(bookingId) || !["confirm", "reject", "complete", "no-show", "cancel"].includes(action)) {
        res.status(400).json({ error: "Unknown booking action." });
        return;
      }

      const cancelReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (action === "cancel" && (cancelReason.length < 2 || cancelReason.length > 280)) {
        res.status(400).json({ error: "Enter a cancellation reason (2–280 characters) for the customer." });
        return;
      }

      const { timeZone, cancellationHours } = await salonSettings();
      const now = DateTime.now().setZone(timeZone);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<AdminBookingRow>(
          `${SELECT_SQL} WHERE b.id = $1 FOR UPDATE OF b`,
          [bookingId],
        );
        const row = found.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Booking not found." });
          return;
        }

        const startAt = DateTime.fromJSDate(row.start_at).setZone(timeZone);
        if (await expirePendingRowIfDue(client, bookingId, row.status, startAt, now)) {
          await client.query("COMMIT");
          res.status(409).json({ error: "This request expired when the appointment start time was reached." });
          return;
        }

        const decision = evaluateAdminAction({
          status: row.status,
          action,
          startAt,
          now,
        });
        if (!decision.allowed) {
          await client.query("ROLLBACK");
          res.status(409).json({ error: decision.error });
          return;
        }

        if (action === "cancel") {
          await client.query(
            `UPDATE bookings
             SET status = $2,
                 cancelled_by_role = 'admin',
                 cancelled_by_user_id = $3,
                 cancelled_reason = $4,
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [bookingId, decision.nextStatus, req.user!.id, cancelReason],
          );
        } else {
          await client.query(`UPDATE bookings SET status = $2, updated_at = NOW() WHERE id = $1`, [
            bookingId,
            decision.nextStatus,
          ]);
        }
        const updated = await client.query<AdminBookingRow>(`${SELECT_SQL} WHERE b.id = $1`, [bookingId]);
        await client.query("COMMIT");
        res.json(mapAdminBooking(updated.rows[0], timeZone, cancellationHours, now));
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // already closed
        }
        throw error;
      } finally {
        client.release();
      }
    }),
  );
}
