import { pool } from "../db/pool.js";
import { hashPassword } from "../lib/password.js";
import { normalizePhone } from "../lib/phone.js";

export async function seedAdmin() {
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const phone = normalizePhone(process.env.ADMIN_PHONE ?? "");

  if (!name || !password || !phone) {
    console.warn("Admin seed skipped: set ADMIN_NAME, ADMIN_PHONE, and ADMIN_PASSWORD in .env");
    return;
  }

  const existing = await pool.query<{ role: string }>("SELECT role FROM users WHERE phone = $1", [
    phone,
  ]);

  if (existing.rowCount) {
    if (existing.rows[0].role !== "admin") {
      console.warn("Admin seed skipped: that phone already belongs to a customer account");
    }
    return;
  }

  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, phone_verified)
     VALUES ($1, $2, $3, 'admin', FALSE)`,
    [name, phone, passwordHash],
  );
  console.log("Seeded admin account for", phone);
}
