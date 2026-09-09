import { DateTime } from "luxon";
import { pool } from "../../db/pool.js";
import { normalizePhone } from "../../lib/phone.js";
import { getAvailability } from "../availability/availability.service.js";
import { evaluateCancel, type BookingStatus } from "./cancel-policy.js";
import { expireDuePending } from "./expire-pending.js";

export type { BookingStatus };

export type PublicBooking = {
  id: number;
  status: BookingStatus;
  serviceId: number;
  barberId: number;
  serviceName: string;
  barberName: string;
  start: string;
  end: string;
  localDate: string;
  localTime: string;
  durationMinutes: number;
  priceIls: number;
  note: string;
  cancellable: boolean;
  cancelledBy: "customer" | "admin" | null;
  cancelledReason: string;
};

type BookingRow = {
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
  cancelled_by_role: "customer" | "admin" | null;
  cancelled_reason: string;
};

const BOOKING_COLUMNS = `
  id, status, service_id, barber_id, service_name, barber_name,
  start_at, end_at, duration_minutes, price_ils, note,
  cancelled_by_role, cancelled_reason
`;

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function mapBooking(row: BookingRow, timeZone: string, cancellationHours: number, now: DateTime): PublicBooking {
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
    durationMinutes: row.duration_minutes,
    priceIls: row.price_ils,
    note: row.note,
    cancellable: decision.allowed,
    cancelledBy: row.cancelled_by_role,
    cancelledReason: row.cancelled_reason || "",
  };
}

async function salonSettings() {
  const salon = await pool.query<{ timezone: string; cancellation_hours: number }>(
    "SELECT timezone, cancellation_hours FROM salon_settings WHERE id = 1",
  );
  return {
    timeZone: salon.rows[0]?.timezone || "Asia/Jerusalem",
    cancellationHours: salon.rows[0]?.cancellation_hours ?? 2,
  };
}

export async function createBooking(input: {
  customerId: number | null;
  guestName?: string;
  guestPhone?: string;
  serviceId: number;
  barberId: number;
  startIso: string;
  note: string;
  idempotencyKey: string | null;
  status?: Extract<BookingStatus, "Pending" | "Confirmed">;
}): Promise<{ status: 201 | 200; data: PublicBooking } | { status: 400 | 404 | 409; error: string }> {
  const { timeZone, cancellationHours } = await salonSettings();
  const now = DateTime.now().setZone(timeZone);
  const start = DateTime.fromISO(input.startIso, { setZone: true }).setZone(timeZone);
  if (!start.isValid) {
    return { status: 400, error: "Choose a valid start time." };
  }

  const date = start.toISODate();
  const localTime = start.toFormat("HH:mm");
  if (!date) {
    return { status: 400, error: "Choose a valid start time." };
  }

  const note = input.note.trim();
  if (note.length > 280) {
    return { status: 400, error: "Keep the note to 280 characters or fewer." };
  }

  const guestName = (input.guestName ?? "").trim();
  const guestPhone = normalizePhone(input.guestPhone ?? "");
  if (input.customerId === null) {
    if (guestName.length < 2 || guestName.length > 80) {
      return { status: 400, error: "Enter the visitor’s name (2–80 characters)." };
    }
    if (!guestPhone) {
      return { status: 400, error: "Enter a valid local or +972 phone number." };
    }
  } else if (guestName || input.guestPhone) {
    return { status: 400, error: "Do not mix an account booking with visitor details." };
  }

  if (input.idempotencyKey) {
    const existing = await loadByIdempotency(input.customerId, input.idempotencyKey, timeZone, cancellationHours, now);
    if (existing) {
      return { status: 200, data: existing };
    }
  }

  const service = await pool.query<{ name: string; price_ils: number; duration_minutes: number; active: boolean }>(
    "SELECT name, price_ils, duration_minutes, active FROM services WHERE id = $1",
    [input.serviceId],
  );
  const barber = await pool.query<{ name: string; active: boolean }>(
    "SELECT name, active FROM barbers WHERE id = $1",
    [input.barberId],
  );

  if (!service.rows[0] || !service.rows[0].active) {
    return { status: 404, error: "Service not found." };
  }
  if (!barber.rows[0] || !barber.rows[0].active) {
    return { status: 404, error: "Barber not found." };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [871001, input.barberId]);

    const availability = await getAvailability({
      serviceId: input.serviceId,
      barberId: input.barberId,
      date,
    });
    if ("error" in availability) {
      await client.query("ROLLBACK");
      return { status: availability.status, error: availability.error ?? "That time is no longer available." };
    }

    const slot = availability.data.slots.find((item) => item.localTime === localTime);
    if (!slot) {
      await client.query("ROLLBACK");
      return { status: 409, error: "That time is no longer available." };
    }

    const durationMinutes = service.rows[0].duration_minutes;
    const startAt = DateTime.fromISO(`${date}T${localTime}`, { zone: timeZone });
    const endAt = startAt.plus({ minutes: durationMinutes });

    try {
      const status = input.status ?? "Pending";
      const holdExpiresAt = status === "Pending" ? startAt.toUTC().toJSDate() : null;
      const inserted = await client.query<BookingRow>(
        `INSERT INTO bookings (
           customer_id, guest_name, guest_phone, barber_id, service_id, start_at, end_at, status, note,
           price_ils, duration_minutes, service_name, barber_name, hold_expires_at, idempotency_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15
         )
         RETURNING ${BOOKING_COLUMNS}`,
        [
          input.customerId,
          input.customerId ? "" : guestName,
          input.customerId ? "" : guestPhone,
          input.barberId,
          input.serviceId,
          startAt.toUTC().toJSDate(),
          endAt.toUTC().toJSDate(),
          status,
          note,
          service.rows[0].price_ils,
          durationMinutes,
          service.rows[0].name,
          barber.rows[0].name,
          holdExpiresAt,
          input.idempotencyKey,
        ],
      );
      await client.query("COMMIT");
      return { status: 201, data: mapBooking(inserted.rows[0], timeZone, cancellationHours, now) };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const existing = await loadByIdempotency(input.customerId, input.idempotencyKey, timeZone, cancellationHours, now);
        if (existing) {
          return { status: 200, data: existing };
        }
      }
      throw error;
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function loadByIdempotency(
  customerId: number | null,
  key: string,
  timeZone: string,
  cancellationHours: number,
  now: DateTime,
) {
  const result = await pool.query<BookingRow>(
    `SELECT ${BOOKING_COLUMNS}
     FROM bookings
     WHERE idempotency_key = $1 AND customer_id IS NOT DISTINCT FROM $2`,
    [key, customerId],
  );
  return result.rows[0] ? mapBooking(result.rows[0], timeZone, cancellationHours, now) : null;
}

export async function listCustomerBookings(customerId: number) {
  await expireDuePending();
  const { timeZone, cancellationHours } = await salonSettings();
  const now = DateTime.now().setZone(timeZone);
  const result = await pool.query<BookingRow>(
    `SELECT ${BOOKING_COLUMNS}
     FROM bookings
     WHERE customer_id = $1
     ORDER BY start_at DESC, id DESC`,
    [customerId],
  );

  return {
    cancellationHours,
    bookings: result.rows.map((row) => mapBooking(row, timeZone, cancellationHours, now)),
  };
}

export async function cancelBooking(input: { customerId: number; bookingId: number }) {
  const { timeZone, cancellationHours } = await salonSettings();
  const now = DateTime.now().setZone(timeZone);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const found = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS}
       FROM bookings
       WHERE id = $1 AND customer_id = $2
       FOR UPDATE`,
      [input.bookingId, input.customerId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { status: 404 as const, error: "Booking not found." };
    }

    const startAt = DateTime.fromJSDate(row.start_at).setZone(timeZone);
    const decision = evaluateCancel({
      status: row.status,
      startAt,
      now,
      cancellationHours,
    });
    if (!decision.allowed) {
      await client.query("ROLLBACK");
      return { status: 409 as const, error: decision.error };
    }

    const updated = await client.query<BookingRow>(
      `UPDATE bookings
       SET status = 'Cancelled',
           cancelled_by_role = 'customer',
           cancelled_by_user_id = $2,
           cancelled_reason = '',
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${BOOKING_COLUMNS}`,
      [input.bookingId, input.customerId],
    );
    await client.query("COMMIT");
    return { status: 200 as const, data: mapBooking(updated.rows[0], timeZone, cancellationHours, now) };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    throw error;
  } finally {
    client.release();
  }
}
