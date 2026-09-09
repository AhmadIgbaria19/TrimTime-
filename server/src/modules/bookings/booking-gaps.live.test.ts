import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { DateTime } from "luxon";
import { createApp } from "../../app.js";
import { migrate } from "../../db/migrate.js";
import { pool } from "../../db/pool.js";
import { seedAdmin } from "../../db/seed-admin.js";
import { seedCatalog } from "../../db/seed-catalog.js";
import { hashPassword } from "../../lib/password.js";
import { listCustomerBookings } from "./bookings.service.js";
import { expireDuePending } from "./expire-pending.js";

type Catalog = {
  services: Array<{ id: number; name: string; durationMinutes: number; priceIls: number; active: boolean }>;
  barbers: Array<{ id: number; name: string; active: boolean; serviceIds: number[] }>;
};

type Slot = { localTime: string; start: string | null };

const NOTE = {
  guest: "gap-test:guest",
  restart: "gap-test:restart",
  confirm: "gap-test:confirm",
  race: "gap-test:race",
  cancel: "gap-test:salon-cancel",
};

let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let adminCookie = "";
let customerId = 0;
let customerPhone = "";
let barberId = 0;
let serviceId = 0;
let serviceName = "";
let barberName = "";
let durationMinutes = 30;
let priceIls = 50;

function cookieFrom(response: Response) {
  const parts = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return parts.map((item) => item.split(";")[0]).join("; ");
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `HTTP ${response.status}`;
}

async function adminJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function insertPastBooking(status: "Pending" | "Confirmed", note: string) {
  const startAt = DateTime.now().setZone("Asia/Jerusalem").minus({ hours: 2 });
  const endAt = startAt.plus({ minutes: durationMinutes });
  const result = await pool.query<{ id: number }>(
    `INSERT INTO bookings (
       customer_id, guest_name, guest_phone, barber_id, service_id, start_at, end_at, status, note,
       price_ils, duration_minutes, service_name, barber_name, hold_expires_at
     ) VALUES (
       $1, '', '', $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12
     )
     RETURNING id`,
    [
      customerId,
      barberId,
      serviceId,
      startAt.toUTC().toJSDate(),
      endAt.toUTC().toJSDate(),
      status,
      note,
      priceIls,
      durationMinutes,
      serviceName,
      barberName,
      status === "Pending" ? startAt.toUTC().toJSDate() : null,
    ],
  );
  return result.rows[0].id;
}

async function bookingStatus(id: number) {
  const result = await pool.query<{
    status: string;
    customer_id: number | null;
    cancelled_by_role: string | null;
    cancelled_reason: string;
    cancelled_by_user_id: number | null;
  }>(
    `SELECT status, customer_id, cancelled_by_role, cancelled_reason, cancelled_by_user_id
     FROM bookings WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

describe("phase 1 booking gaps", () => {
  before(async () => {
    assert.equal(
      process.env.PGDATABASE,
      process.env.PGDATABASE_TEST || "trimtime_test",
      "Live tests must run against trimtime_test via npm run test:live.",
    );
    await migrate();
    await seedAdmin();
    await seedCatalog();
    let customer = await pool.query<{ id: number; phone: string }>(
      "SELECT id, phone FROM users WHERE role = 'customer' ORDER BY id ASC LIMIT 1",
    );
    if (!customer.rows[0]) {
      await pool.query(
        `INSERT INTO users (name, phone, password_hash, role, phone_verified)
         VALUES ('Gap Fixture', '+972591000001', $1, 'customer', FALSE)`,
        [await hashPassword("TestPass12")],
      );
      customer = await pool.query<{ id: number; phone: string }>(
        "SELECT id, phone FROM users WHERE role = 'customer' ORDER BY id ASC LIMIT 1",
      );
    }
    const service = await pool.query<{ id: number; name: string; duration_minutes: number; price_ils: number }>(
      "SELECT id, name, duration_minutes, price_ils FROM services WHERE active = TRUE ORDER BY id ASC LIMIT 1",
    );
    const barber = await pool.query<{ id: number; name: string }>(
      "SELECT id, name FROM barbers WHERE active = TRUE ORDER BY id ASC LIMIT 1",
    );
    assert.ok(customer.rows[0], "need a customer row");
    assert.ok(service.rows[0], "need a service row");
    assert.ok(barber.rows[0], "need a barber row");
    customerId = customer.rows[0].id;
    customerPhone = customer.rows[0].phone;
    serviceId = service.rows[0].id;
    serviceName = service.rows[0].name;
    durationMinutes = service.rows[0].duration_minutes;
    priceIls = service.rows[0].price_ils;
    barberId = barber.rows[0].id;
    barberName = barber.rows[0].name;

    const app = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: process.env.ADMIN_PHONE,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    assert.equal(login.status, 200, await readError(login));
    adminCookie = cookieFrom(login);
    assert.ok(adminCookie.includes("trimtime_session="));
  });

  after(async () => {
    try {
      await pool.query("DELETE FROM bookings WHERE note LIKE 'gap-test:%'");
    } catch {
      // Setup may have failed before the database was ready.
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end().catch(() => undefined);
  });

  it("expires overdue Pending without opening the admin list", async () => {
    const id = await insertPastBooking("Pending", NOTE.restart);
    const expired = await expireDuePending();
    assert.ok(expired.includes(id));
    assert.equal((await bookingStatus(id)).status, "Expired");
  });

  it("refuses confirm after start and persists Expired", async () => {
    const id = await insertPastBooking("Pending", NOTE.confirm);
    const { response, data } = await adminJson(`/api/admin/bookings/${id}/confirm`, { method: "POST", body: "{}" });
    assert.equal(response.status, 409);
    assert.match(String((data as { error?: string }).error), /expired/i);
    assert.equal((await bookingStatus(id)).status, "Expired");
  });

  it("lets confirm lose to expiry when both run together", async () => {
    const id = await insertPastBooking("Pending", NOTE.race);
    const [confirmResult] = await Promise.all([
      adminJson(`/api/admin/bookings/${id}/confirm`, { method: "POST", body: "{}" }),
      expireDuePending(),
    ]);
    assert.equal(confirmResult.response.status, 409);
    assert.equal((await bookingStatus(id)).status, "Expired");
  });

  it("stores a guest booking without a user and hides it from My Bookings", async () => {
    const catalog = await fetch(`${base}/api/catalog`).then((res) => res.json() as Promise<Catalog>);
    const service = catalog.services.find((item) => item.active && item.id === serviceId) ?? catalog.services.find((item) => item.active);
    const barber = catalog.barbers.find((item) => item.active && item.serviceIds.includes(service!.id));
    assert.ok(service && barber, "need an active service and barber");

    const zone = "Asia/Jerusalem";
    let slot: Slot | undefined;
    for (let day = 0; day < 14 && !slot; day += 1) {
      const date = DateTime.now().setZone(zone).plus({ days: day }).toISODate();
      const availability = await fetch(
        `${base}/api/availability?${new URLSearchParams({
          serviceId: String(service.id),
          barberId: String(barber.id),
          date: date ?? "",
        })}`,
      ).then((res) => res.json() as Promise<{ slots?: Slot[]; error?: string }>);
      slot = availability.slots?.find((item) => item.start);
    }
    assert.ok(slot?.start, "need an open slot for the guest booking");

    const usersBefore = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
    const { response, data } = await adminJson("/api/admin/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": `gap-guest-${Date.now()}` },
      body: JSON.stringify({
        guestName: "Walk In Guest",
        guestPhone: customerPhone,
        serviceId: service.id,
        barberId: barber.id,
        start: slot.start,
        note: NOTE.guest,
      }),
    });
    assert.equal(response.status, 201, String((data as { error?: string }).error || ""));
    const booking = data as { id: number; isGuest?: boolean; customerName: string; status: string };
    assert.equal(booking.status, "Confirmed");
    assert.equal(booking.isGuest, true);
    assert.equal(booking.customerName, "Walk In Guest");

    const usersAfter = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
    assert.equal(usersAfter.rows[0].n, usersBefore.rows[0].n);
    assert.equal((await bookingStatus(booking.id)).customer_id, null);

    const linked = await pool.query("SELECT id FROM users WHERE phone = $1 AND role = 'customer'", [customerPhone]);
    assert.ok(linked.rows.some((row) => row.id === customerId));
    const mine = await listCustomerBookings(customerId);
    assert.equal(mine.bookings.some((item) => item.id === booking.id), false);

    const desk = await adminJson("/api/admin/bookings");
    assert.equal(desk.response.status, 200);
    const visible = (desk.data as { bookings: Array<{ id: number; isGuest?: boolean }> }).bookings.find(
      (item) => item.id === booking.id,
    );
    assert.ok(visible);
    assert.equal(visible.isGuest, true);
  });

  it("lets the salon cancel a confirmed visit after start with a reason the customer can see", async () => {
    const id = await insertPastBooking("Confirmed", NOTE.cancel);
    const { response, data } = await adminJson(`/api/admin/bookings/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Barber called in sick" }),
    });
    assert.equal(response.status, 200, String((data as { error?: string }).error || ""));
    const row = await bookingStatus(id);
    assert.equal(row.status, "Cancelled");
    assert.equal(row.cancelled_by_role, "admin");
    assert.ok(row.cancelled_by_user_id);
    assert.equal(row.cancelled_reason, "Barber called in sick");

    const mine = await listCustomerBookings(customerId);
    const seen = mine.bookings.find((item) => item.id === id);
    assert.ok(seen);
    assert.equal(seen.cancelledBy, "admin");
    assert.equal(seen.cancelledReason, "Barber called in sick");
  });
});
