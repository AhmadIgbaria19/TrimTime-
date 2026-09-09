import { pool } from "../../db/pool.js";
import { handle } from "../../lib/http.js";
import { getCatalog } from "../catalog/catalog.store.js";
import type { Request, Response } from "express";
import type { Router } from "express";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function asBool(value: unknown, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "false") {
    return value === "true";
  }
  return fallback;
}

function timeOk(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function sendCatalog(res: Response) {
  const catalog = await getCatalog(true);
  res.json(catalog);
}

export function registerAdminCatalogRoutes(router: Router) {
  router.get(
    "/catalog",
    handle(async (_req, res) => {
      await sendCatalog(res);
    }),
  );

  router.patch(
    "/salon",
    handle(async (req, res) => {
      const name = asString(req.body?.name);
      if (name.length < 2) {
        res.status(400).json({ error: "Salon name is required." });
        return;
      }

      const cancellationHours = asInt(req.body?.cancellationHours);
      if (!Number.isInteger(cancellationHours) || cancellationHours < 0) {
        res.status(400).json({ error: "Cancellation hours must be 0 or more." });
        return;
      }

      const bookingHorizonDays = asInt(req.body?.bookingHorizonDays);
      if (!Number.isInteger(bookingHorizonDays) || bookingHorizonDays < 0 || bookingHorizonDays > 365) {
        res.status(400).json({ error: "Booking window must be 0–365 days." });
        return;
      }

      await pool.query(
        `UPDATE salon_settings SET
           name = $1, tagline = $2, city = $3, address = $4, phone = $5, email = $6,
           logo_url = $7, hero_image_url = $8, cancellation_hours = $9,
           booking_horizon_days = $10, updated_at = NOW()
         WHERE id = 1`,
        [
          name,
          asString(req.body?.tagline),
          asString(req.body?.city),
          asString(req.body?.address),
          asString(req.body?.phone),
          asString(req.body?.email),
          asString(req.body?.logoUrl),
          asString(req.body?.heroImageUrl),
          cancellationHours,
          bookingHorizonDays,
        ],
      );
      await sendCatalog(res);
    }),
  );

  router.post(
    "/services",
    handle(async (req, res) => {
      const created = await upsertService(req, res, null);
      if (created) {
        await sendCatalog(res);
      }
    }),
  );

  router.patch(
    "/services/:id",
    handle(async (req, res) => {
      const id = asInt(req.params.id);
      const updated = await upsertService(req, res, id);
      if (updated) {
        await sendCatalog(res);
      }
    }),
  );

  router.delete(
    "/services/:id",
    handle(async (req, res) => {
      const id = asInt(req.params.id);
      const result = await pool.query("DELETE FROM services WHERE id = $1", [id]);
      if (!result.rowCount) {
        res.status(404).json({ error: "Service not found." });
        return;
      }
      await sendCatalog(res);
    }),
  );

  router.post(
    "/barbers",
    handle(async (req, res) => {
      const created = await upsertBarber(req, res, null);
      if (created) {
        await sendCatalog(res);
      }
    }),
  );

  router.patch(
    "/barbers/:id",
    handle(async (req, res) => {
      const id = asInt(req.params.id);
      const updated = await upsertBarber(req, res, id);
      if (updated) {
        await sendCatalog(res);
      }
    }),
  );

  router.delete(
    "/barbers/:id",
    handle(async (req, res) => {
      const id = asInt(req.params.id);
      const result = await pool.query("DELETE FROM barbers WHERE id = $1", [id]);
      if (!result.rowCount) {
        res.status(404).json({ error: "Barber not found." });
        return;
      }
      await sendCatalog(res);
    }),
  );

  router.put(
    "/hours",
    handle(async (req, res) => {
      const barberIdRaw = req.body?.barberId;
      const barberId = barberIdRaw === null || barberIdRaw === undefined ? null : asInt(barberIdRaw);
      if (barberIdRaw !== null && barberIdRaw !== undefined && !Number.isInteger(barberId)) {
        res.status(400).json({ error: "Invalid barber id." });
        return;
      }

      const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
      await pool.query("BEGIN");
      try {
        if (barberId === null) {
          await pool.query("DELETE FROM working_hours WHERE barber_id IS NULL");
        } else {
          await pool.query("DELETE FROM working_hours WHERE barber_id = $1", [barberId]);
        }

        for (const hour of hours) {
          const weekday = asInt(hour.weekday);
          const startTime = asString(hour.startTime);
          const endTime = asString(hour.endTime);
          if (weekday < 0 || weekday > 6 || !timeOk(startTime) || !timeOk(endTime) || startTime >= endTime) {
            throw new Error("INVALID_HOURS");
          }
          await pool.query(
            `INSERT INTO working_hours (barber_id, weekday, start_time, end_time)
             VALUES ($1, $2, $3, $4)`,
            [barberId, weekday, startTime, endTime],
          );
        }
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        if (error instanceof Error && error.message === "INVALID_HOURS") {
          res.status(400).json({ error: "Each open day needs a start time before the end time." });
          return;
        }
        throw error;
      }
      await sendCatalog(res);
    }),
  );

  router.post(
    "/breaks",
    handle(async (req, res) => {
      const weekday = asInt(req.body?.weekday);
      const startTime = asString(req.body?.startTime);
      const endTime = asString(req.body?.endTime);
      const barberId = req.body?.barberId == null ? null : asInt(req.body.barberId);
      if (weekday < 0 || weekday > 6 || !timeOk(startTime) || !timeOk(endTime) || startTime >= endTime) {
        res.status(400).json({ error: "Enter a valid break window." });
        return;
      }
      await pool.query(
        `INSERT INTO schedule_breaks (barber_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [barberId, weekday, startTime, endTime],
      );
      await sendCatalog(res);
    }),
  );

  router.delete(
    "/breaks/:id",
    handle(async (req, res) => {
      const result = await pool.query("DELETE FROM schedule_breaks WHERE id = $1", [asInt(req.params.id)]);
      if (!result.rowCount) {
        res.status(404).json({ error: "Break not found." });
        return;
      }
      await sendCatalog(res);
    }),
  );

  router.post(
    "/time-off",
    handle(async (req, res) => {
      const startsOn = asString(req.body?.startsOn);
      const endsOn = asString(req.body?.endsOn);
      const reason = asString(req.body?.reason);
      const barberId = req.body?.barberId == null ? null : asInt(req.body.barberId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || startsOn > endsOn) {
        res.status(400).json({ error: "Enter a valid time-off range." });
        return;
      }
      await pool.query(
        `INSERT INTO time_off (barber_id, starts_on, ends_on, reason)
         VALUES ($1, $2, $3, $4)`,
        [barberId, startsOn, endsOn, reason],
      );
      await sendCatalog(res);
    }),
  );

  router.delete(
    "/time-off/:id",
    handle(async (req, res) => {
      const result = await pool.query("DELETE FROM time_off WHERE id = $1", [asInt(req.params.id)]);
      if (!result.rowCount) {
        res.status(404).json({ error: "Time off not found." });
        return;
      }
      await sendCatalog(res);
    }),
  );

  router.post(
    "/date-blocks",
    handle(async (req, res) => {
      const onDate = asString(req.body?.onDate);
      const startTime = asString(req.body?.startTime);
      const endTime = asString(req.body?.endTime);
      const reason = asString(req.body?.reason);
      const barberId = req.body?.barberId == null ? null : asInt(req.body.barberId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate) || !timeOk(startTime) || !timeOk(endTime) || startTime >= endTime) {
        res.status(400).json({ error: "Enter a date and a start time before the end time." });
        return;
      }
      await pool.query(
        `INSERT INTO date_blocks (barber_id, on_date, start_time, end_time, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [barberId, onDate, startTime, endTime, reason],
      );
      await sendCatalog(res);
    }),
  );

  router.delete(
    "/date-blocks/:id",
    handle(async (req, res) => {
      const result = await pool.query("DELETE FROM date_blocks WHERE id = $1", [asInt(req.params.id)]);
      if (!result.rowCount) {
        res.status(404).json({ error: "Closed hours not found." });
        return;
      }
      await sendCatalog(res);
    }),
  );
}

async function upsertService(req: Request, res: Response, id: number | null) {
  const name = asString(req.body?.name);
  const description = asString(req.body?.description);
  const priceIls = asInt(req.body?.priceIls);
  const durationMinutes = asInt(req.body?.durationMinutes);
  const active = asBool(req.body?.active, true);
  const sortOrder = Number.isInteger(asInt(req.body?.sortOrder)) ? asInt(req.body?.sortOrder) : 0;

  if (name.length < 2 || !Number.isInteger(priceIls) || priceIls < 0 || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    res.status(400).json({ error: "Service needs a name, price, and duration in minutes." });
    return false;
  }

  if (id === null) {
    await pool.query(
      `INSERT INTO services (name, description, price_ils, duration_minutes, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, description, priceIls, durationMinutes, active, sortOrder],
    );
    return true;
  }

  const result = await pool.query(
    `UPDATE services
     SET name = $1, description = $2, price_ils = $3, duration_minutes = $4, active = $5,
         sort_order = $6, updated_at = NOW()
     WHERE id = $7`,
    [name, description, priceIls, durationMinutes, active, sortOrder, id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Service not found." });
    return false;
  }
  return true;
}

async function upsertBarber(req: Request, res: Response, id: number | null) {
  const name = asString(req.body?.name);
  const roleTitle = asString(req.body?.roleTitle);
  const focus = asString(req.body?.focus);
  const photoUrl = asString(req.body?.photoUrl);
  const active = asBool(req.body?.active, true);
  const sortOrder = Number.isInteger(asInt(req.body?.sortOrder)) ? asInt(req.body?.sortOrder) : 0;
  const serviceIds = Array.isArray(req.body?.serviceIds)
    ? req.body.serviceIds.map((value: unknown) => asInt(value)).filter((value: number) => Number.isInteger(value))
    : [];

  if (name.length < 2) {
    res.status(400).json({ error: "Barber name is required." });
    return false;
  }

  let barberId = id;
  if (id === null) {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO barbers (name, role_title, focus, photo_url, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, roleTitle, focus, photoUrl, active, sortOrder],
    );
    barberId = inserted.rows[0].id;
  } else {
    const result = await pool.query(
      `UPDATE barbers
       SET name = $1, role_title = $2, focus = $3, photo_url = $4, active = $5,
           sort_order = $6, updated_at = NOW()
       WHERE id = $7`,
      [name, roleTitle, focus, photoUrl, active, sortOrder, id],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Barber not found." });
      return false;
    }
  }

  await pool.query("DELETE FROM barber_services WHERE barber_id = $1", [barberId]);
  for (const serviceId of serviceIds) {
    await pool.query(
      "INSERT INTO barber_services (barber_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [barberId, serviceId],
    );
  }
  return true;
}
