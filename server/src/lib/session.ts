import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import { pool } from "../db/pool.js";
import type { PublicUser, UserRole } from "../types.js";

export const SESSION_COOKIE = "trimtime_session";
const SESSION_DAYS = 7;

type UserRow = {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  phone_verified: boolean;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    phoneVerified: row.phone_verified,
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function createSession(userId: number, res: Response) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashToken(token), expiresAt],
  );

  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function destroySession(token: string | undefined, res: Response) {
  if (token) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: false });
}

export async function findUserBySessionToken(token: string): Promise<PublicUser | null> {
  const result = await pool.query<UserRow>(
    `SELECT users.id, users.name, users.phone, users.role, users.phone_verified
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [hashToken(token)],
  );

  const row = result.rows[0];
  return row ? toPublicUser(row) : null;
}
