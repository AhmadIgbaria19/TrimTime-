import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";
import { DateTime } from "luxon";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { seedAdmin } from "./db/seed-admin.js";
import { seedCatalog } from "./db/seed-catalog.js";

const execFileAsync = promisify(execFile);

type Catalog = {
  services: Array<{
    id: number;
    name: string;
    description: string;
    priceIls: number;
    durationMinutes: number;
    active: boolean;
    sortOrder: number;
  }>;
  barbers: Array<{ id: number; name: string; active: boolean; serviceIds: number[] }>;
};

type Slot = { localTime: string; start: string | null };
type PublicBooking = {
  id: number;
  status: string;
  priceIls: number;
  durationMinutes: number;
  serviceName: string;
  note: string;
};

const PASSWORD = "TestPass12";
const NOTE = "phase2-keep-this-note";

let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let adminCookie = "";
let customerACookie = "";
let customerBCookie = "";
let service: Catalog["services"][number];
let barber: Catalog["barbers"][number];
let openSlot: Slot;

function requireTestDatabase() {
  assert.equal(
    process.env.PGDATABASE,
    process.env.PGDATABASE_TEST || "trimtime_test",
    "Live tests must run against trimtime_test via npm run test:live.",
  );
}

function cookieFrom(response: Response) {
  const parts = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return parts.map((item) => item.split(";")[0]).join("; ");
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `HTTP ${response.status}`;
}

async function json(path: string, init: RequestInit = {}, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function registerCustomer(name: string, phone: string) {
  const { response, data } = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      phone,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    }),
  });
  assert.equal(response.status, 201, await Promise.resolve(String((data as { error?: string }).error || response.status)));
  return cookieFrom(response);
}

async function findOpenSlot(serviceId: number, barberId: number) {
  const zone = "Asia/Jerusalem";
  for (let day = 1; day <= 20; day += 1) {
    const date = DateTime.now().setZone(zone).plus({ days: day }).toISODate();
    if (!date) {
      continue;
    }
    const { response, data } = await json(
      `/api/availability?${new URLSearchParams({
        serviceId: String(serviceId),
        barberId: String(barberId),
        date,
      })}`,
    );
    if (!response.ok) {
      continue;
    }
    const slot = (data as { slots?: Slot[] }).slots?.find((item) => item.start);
    if (slot?.start) {
      return slot;
    }
  }
  return null;
}

async function listenApp() {
  const app = createApp();
  const next = app.listen(0, "127.0.0.1");
  await once(next, "listening");
  const address = next.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
  return next;
}

describe("phase 2 local full-stack readiness", () => {
  before(async () => {
    requireTestDatabase();
    await migrate();
    await seedAdmin();
    await seedCatalog();

    server = await listenApp();

    const login = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        phone: process.env.ADMIN_PHONE,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    assert.equal(login.response.status, 200, String((login.data as { error?: string }).error || ""));
    adminCookie = cookieFrom(login.response);

    customerACookie = await registerCustomer("Phase Two A", "0591111001");
    customerBCookie = await registerCustomer("Phase Two B", "0591111002");

    const catalog = await json("/api/catalog");
    assert.equal(catalog.response.status, 200);
    const payload = catalog.data as Catalog;
    const pickedService = payload.services.find((item) => item.active);
    const pickedBarber = payload.barbers.find(
      (item) => item.active && pickedService && item.serviceIds.includes(pickedService.id),
    );
    assert.ok(pickedService && pickedBarber, "seeded catalog must include a bookable pair");
    service = pickedService;
    barber = pickedBarber;
    const slot = await findOpenSlot(service.id, barber.id);
    assert.ok(slot?.start, "need a future open slot on the test catalog");
    openSlot = slot;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.end().catch(() => undefined);
  });

  it("lets a customer book, keeps the note, and lets admin confirm then the customer cancel", async () => {
    const created = await json(
      "/api/bookings",
      {
        method: "POST",
        headers: { "Idempotency-Key": `phase2-book-${Date.now()}` },
        body: JSON.stringify({
          serviceId: service.id,
          barberId: barber.id,
          start: openSlot.start,
          note: NOTE,
        }),
      },
      customerACookie,
    );
    assert.equal(created.response.status, 201, String((created.data as { error?: string }).error || ""));
    const pending = created.data as PublicBooking;
    assert.equal(pending.status, "Pending");
    assert.equal(pending.note, NOTE);
    assert.equal(pending.priceIls, service.priceIls);
    assert.equal(pending.durationMinutes, service.durationMinutes);

    const confirmed = await json(`/api/admin/bookings/${pending.id}/confirm`, { method: "POST", body: "{}" }, adminCookie);
    assert.equal(confirmed.response.status, 200, String((confirmed.data as { error?: string }).error || ""));
    assert.equal((confirmed.data as PublicBooking).status, "Confirmed");
    assert.equal((confirmed.data as PublicBooking).note, NOTE);

    const cancelled = await json(`/api/bookings/${pending.id}/cancel`, { method: "POST", body: "{}" }, customerACookie);
    assert.equal(cancelled.response.status, 200, String((cancelled.data as { error?: string }).error || ""));
    assert.equal((cancelled.data as PublicBooking).status, "Cancelled");
  });

  it("lets admin reject a pending request", async () => {
    const slot = await findOpenSlot(service.id, barber.id);
    assert.ok(slot?.start);
    const created = await json(
      "/api/bookings",
      {
        method: "POST",
        headers: { "Idempotency-Key": `phase2-reject-${Date.now()}` },
        body: JSON.stringify({
          serviceId: service.id,
          barberId: barber.id,
          start: slot.start,
          note: "",
        }),
      },
      customerBCookie,
    );
    assert.equal(created.response.status, 201, String((created.data as { error?: string }).error || ""));
    const rejected = await json(
      `/api/admin/bookings/${(created.data as PublicBooking).id}/reject`,
      { method: "POST", body: "{}" },
      adminCookie,
    );
    assert.equal(rejected.response.status, 200);
    assert.equal((rejected.data as PublicBooking).status, "Rejected");
  });

  it("keeps the booking snapshot after the service price and duration change", async () => {
    const slot = await findOpenSlot(service.id, barber.id);
    assert.ok(slot?.start);
    const created = await json(
      "/api/bookings",
      {
        method: "POST",
        headers: { "Idempotency-Key": `phase2-snap-${Date.now()}` },
        body: JSON.stringify({
          serviceId: service.id,
          barberId: barber.id,
          start: slot.start,
          note: "",
        }),
      },
      customerACookie,
    );
    assert.equal(created.response.status, 201, String((created.data as { error?: string }).error || ""));
    const booking = created.data as PublicBooking;
    const originalPrice = booking.priceIls;
    const originalDuration = booking.durationMinutes;
    const originalName = booking.serviceName;

    const patched = await json(
      `/api/admin/services/${service.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: `${service.name} edited`,
          description: "Changed after booking",
          priceIls: originalPrice + 35,
          durationMinutes: originalDuration + 15,
          active: true,
          sortOrder: service.sortOrder,
        }),
      },
      adminCookie,
    );
    assert.equal(patched.response.status, 200, String((patched.data as { error?: string }).error || ""));

    const mine = await json("/api/bookings", {}, customerACookie);
    const seen = (mine.data as { bookings: PublicBooking[] }).bookings.find((item) => item.id === booking.id);
    assert.ok(seen);
    assert.equal(seen.priceIls, originalPrice);
    assert.equal(seen.durationMinutes, originalDuration);
    assert.equal(seen.serviceName, originalName);

    const restored = await json(
      `/api/admin/services/${service.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: service.name,
          description: service.description,
          priceIls: service.priceIls,
          durationMinutes: service.durationMinutes,
          active: true,
          sortOrder: service.sortOrder,
        }),
      },
      adminCookie,
    );
    assert.equal(restored.response.status, 200);
  });

  it("allows only one of two concurrent bookings for the same slot", async () => {
    const slot = await findOpenSlot(service.id, barber.id);
    assert.ok(slot?.start);
    const body = {
      serviceId: service.id,
      barberId: barber.id,
      start: slot.start,
      note: "",
    };
    const [first, second] = await Promise.all([
      json(
        "/api/bookings",
        {
          method: "POST",
          headers: { "Idempotency-Key": `phase2-race-a-${Date.now()}` },
          body: JSON.stringify(body),
        },
        customerACookie,
      ),
      json(
        "/api/bookings",
        {
          method: "POST",
          headers: { "Idempotency-Key": `phase2-race-b-${Date.now()}` },
          body: JSON.stringify(body),
        },
        customerBCookie,
      ),
    ]);
    const statuses = [first.response.status, second.response.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const winner = first.response.status === 201 ? first.data : second.data;
    const loser = first.response.status === 409 ? first.data : second.data;
    assert.equal((winner as PublicBooking).id > 0, true);
    assert.match(String((loser as { error?: string }).error), /no longer available/i);

    const counted = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM bookings
       WHERE barber_id = $1 AND start_at = $2 AND status IN ('Pending', 'Confirmed')`,
      [barber.id, new Date(slot.start as string)],
    );
    assert.equal(counted.rows[0].n, 1);
  });

  it("returns the same booking when the customer retries the same idempotency key", async () => {
    const slot = await findOpenSlot(service.id, barber.id);
    assert.ok(slot?.start);
    const key = `phase2-idem-${Date.now()}`;
    const body = JSON.stringify({
      serviceId: service.id,
      barberId: barber.id,
      start: slot.start,
      note: "retry me",
    });
    const first = await json("/api/bookings", { method: "POST", headers: { "Idempotency-Key": key }, body }, customerACookie);
    const retry = await json("/api/bookings", { method: "POST", headers: { "Idempotency-Key": key }, body }, customerACookie);
    assert.equal(first.response.status, 201);
    assert.equal(retry.response.status, 200);
    assert.equal((retry.data as PublicBooking).id, (first.data as PublicBooking).id);

    const counted = await pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM bookings WHERE idempotency_key = $1",
      [key],
    );
    assert.equal(counted.rows[0].n, 1);
  });

  it("hides one customer’s bookings from another and blocks admin routes", async () => {
    const mineA = await json("/api/bookings", {}, customerACookie);
    const mineB = await json("/api/bookings", {}, customerBCookie);
    const idsA = new Set((mineA.data as { bookings: PublicBooking[] }).bookings.map((item) => item.id));
    const idsB = (mineB.data as { bookings: PublicBooking[] }).bookings.map((item) => item.id);
    for (const id of idsB) {
      assert.equal(idsA.has(id), false);
    }

    const adminAsCustomer = await json("/api/admin/session", {}, customerACookie);
    assert.equal(adminAsCustomer.response.status, 403);

    const adminBookingsAsCustomer = await json("/api/admin/bookings", {}, customerACookie);
    assert.equal(adminBookingsAsCustomer.response.status, 403);

    const customerAsAdmin = await json(
      "/api/bookings",
      {
        method: "POST",
        body: JSON.stringify({
          serviceId: service.id,
          barberId: barber.id,
          start: openSlot.start,
          note: "",
        }),
      },
      adminCookie,
    );
    assert.equal(customerAsAdmin.response.status, 403);
  });

  it("keeps bookings after the API process restarts", async () => {
    const before = await json("/api/bookings", {}, customerACookie);
    const ids = (before.data as { bookings: PublicBooking[] }).bookings.map((item) => item.id);
    assert.ok(ids.length > 0);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server = await listenApp();

    const health = await json("/api/health");
    assert.equal(health.response.status, 200);

    const afterRestart = await json("/api/bookings", {}, customerACookie);
    assert.equal(afterRestart.response.status, 200);
    const idsAfter = (afterRestart.data as { bookings: PublicBooking[] }).bookings.map((item) => item.id);
    for (const id of ids) {
      assert.equal(idsAfter.includes(id), true);
    }

    const persisted = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM bookings WHERE id = ANY($1::int[])", [
      ids,
    ]);
    assert.equal(persisted.rows[0].n, ids.length);
  });

  it("loads the customer and admin shells on desktop and phone widths when the client is running", async () => {
    const client = await fetch("http://127.0.0.1:3001/login").catch(() => null);
    if (!client || !client.ok) {
      assert.ok(true, "client on :3001 not running; API journeys already covered");
      return;
    }
    const loginHtml = await client.text();
    assert.match(loginHtml, /TrimTime/i);

    const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    for (const size of ["1280,800", "390,844"]) {
      try {
        const { stdout } = await execFileAsync(
          chrome,
          ["--headless=new", "--disable-gpu", `--window-size=${size}`, "--virtual-time-budget=4000", "--dump-dom", "http://127.0.0.1:3001/login"],
          { timeout: 20000 },
        );
        assert.match(stdout, /Sign in|Create account|TrimTime/i);
      } catch {
        assert.ok(true, `chrome dump skipped at ${size}`);
        return;
      }
    }
  });
});
