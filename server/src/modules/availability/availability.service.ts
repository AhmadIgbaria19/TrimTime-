import { DateTime } from "luxon";
import { pool } from "../../db/pool.js";
import { expireDuePending } from "../bookings/expire-pending.js";
import { availableLocalTimes, timeToMinutes } from "./slots.js";

type HourRow = { start_time: string; end_time: string };
type BreakRow = { start_time: string; end_time: string };

function appWeekday(date: DateTime) {
  return date.weekday === 7 ? 0 : date.weekday;
}

function asTime(value: string) {
  return value.slice(0, 5);
}

export async function getAvailability(input: {
  serviceId: number;
  barberId: number;
  date: string;
}) {
  const { serviceId, barberId, date } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Enter a date as YYYY-MM-DD.", status: 400 as const };
  }

  await expireDuePending();

  const salon = await pool.query<{ timezone: string; booking_horizon_days: number }>(
    "SELECT timezone, booking_horizon_days FROM salon_settings WHERE id = 1",
  );
  const timeZone = salon.rows[0]?.timezone || "Asia/Jerusalem";
  const day = DateTime.fromISO(date, { zone: timeZone });
  if (!day.isValid) {
    return { error: "That date is not valid.", status: 400 as const };
  }

  const today = DateTime.now().setZone(timeZone).startOf("day");
  const last = today.plus({ days: salon.rows[0]?.booking_horizon_days ?? 30 });
  if (day < today || day > last) {
    return { error: "That date is outside the booking window.", status: 400 as const };
  }

  const service = await pool.query<{ duration_minutes: number; active: boolean; name: string }>(
    "SELECT duration_minutes, active, name FROM services WHERE id = $1",
    [serviceId],
  );
  const barber = await pool.query<{ active: boolean; name: string }>(
    "SELECT active, name FROM barbers WHERE id = $1",
    [barberId],
  );

  if (!service.rows[0] || !service.rows[0].active) {
    return { error: "Service not found.", status: 404 as const };
  }
  if (!barber.rows[0] || !barber.rows[0].active) {
    return { error: "Barber not found.", status: 404 as const };
  }

  const offered = await pool.query("SELECT 1 FROM barber_services WHERE barber_id = $1 AND service_id = $2", [
    barberId,
    serviceId,
  ]);
  if (!offered.rowCount) {
    return { error: "This barber does not offer that service.", status: 400 as const };
  }

  const weekday = appWeekday(day);
  const durationMinutes = service.rows[0].duration_minutes;

  const timeOff = await pool.query(
    `SELECT 1 FROM time_off
     WHERE starts_on <= $1::date AND ends_on >= $1::date
       AND (barber_id IS NULL OR barber_id = $2)`,
    [date, barberId],
  );
  if (timeOff.rowCount) {
    return {
      status: 200 as const,
      data: emptyPayload(date, timeZone, serviceId, barberId, durationMinutes),
    };
  }

  const salonHours = await pool.query<HourRow>(
    `SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM working_hours WHERE barber_id IS NULL AND weekday = $1`,
    [weekday],
  );
  if (!salonHours.rowCount) {
    return {
      status: 200 as const,
      data: emptyPayload(date, timeZone, serviceId, barberId, durationMinutes),
    };
  }

  let hours = await pool.query<HourRow>(
    `SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM working_hours WHERE barber_id = $1 AND weekday = $2`,
    [barberId, weekday],
  );
  if (!hours.rowCount) {
    hours = salonHours;
  }

  const breaks = await pool.query<BreakRow>(
    `SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM schedule_breaks
     WHERE weekday = $1 AND (barber_id IS NULL OR barber_id = $2)`,
    [weekday, barberId],
  );

  const work = hours.rows.map((row) => ({
    start: timeToMinutes(asTime(row.start_time)),
    end: timeToMinutes(asTime(row.end_time)),
  }));
  const busy = breaks.rows.map((row) => ({
    start: timeToMinutes(asTime(row.start_time)),
    end: timeToMinutes(asTime(row.end_time)),
  }));

  const bookingBusy = await loadBookingBarriers(barberId, date, timeZone);
  const dateBlocks = await pool.query<BreakRow>(
    `SELECT to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time
     FROM date_blocks
     WHERE on_date = $1::date AND (barber_id IS NULL OR barber_id = $2)`,
    [date, barberId],
  );
  const now = DateTime.now().setZone(timeZone);
  const localTimes = availableLocalTimes(
    work,
    [
      ...busy,
      ...bookingBusy,
      ...dateBlocks.rows.map((row) => ({
        start: timeToMinutes(asTime(row.start_time)),
        end: timeToMinutes(asTime(row.end_time)),
      })),
    ],
    durationMinutes,
  ).filter((localTime) => {
    const start = DateTime.fromISO(`${date}T${localTime}`, { zone: timeZone });
    return start > now;
  });

  return {
    status: 200 as const,
    data: {
      date,
      timeZone,
      serviceId,
      barberId,
      durationMinutes,
      slots: localTimes.map((localTime) => ({
        localTime,
        start: DateTime.fromISO(`${date}T${localTime}`, { zone: timeZone }).toUTC().toISO(),
      })),
    },
  };
}

function emptyPayload(
  date: string,
  timeZone: string,
  serviceId: number,
  barberId: number,
  durationMinutes: number,
) {
  return { date, timeZone, serviceId, barberId, durationMinutes, slots: [] as { localTime: string; start: string | null }[] };
}

async function loadBookingBarriers(barberId: number, date: string, timeZone: string) {
  try {
    const dayStart = DateTime.fromISO(date, { zone: timeZone }).startOf("day");
    const dayEnd = dayStart.plus({ days: 1 });
    const result = await pool.query<{ start_at: Date; end_at: Date }>(
      `SELECT start_at, end_at FROM bookings
       WHERE barber_id = $1
         AND status IN ('Pending', 'Confirmed')
         AND start_at < $3 AND end_at > $2
         AND (status <> 'Pending' OR hold_expires_at IS NULL OR hold_expires_at > NOW())`,
      [barberId, dayStart.toUTC().toJSDate(), dayEnd.toUTC().toJSDate()],
    );

    return result.rows.map((row) => {
      const start = DateTime.fromJSDate(row.start_at).setZone(timeZone);
      const end = DateTime.fromJSDate(row.end_at).setZone(timeZone);
      return {
        start: start.hour * 60 + start.minute,
        end: end.hour * 60 + end.minute,
      };
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "42P01") {
      return [];
    }
    throw error;
  }
}
