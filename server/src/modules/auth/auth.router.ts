import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "../../db/pool.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { normalizePhone } from "../../lib/phone.js";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  toPublicUser,
} from "../../lib/session.js";
import { requireAuth } from "../../middleware/auth.js";
import type { UserRole } from "../../types.js";

type UserRow = {
  id: number;
  name: string;
  phone: string;
  password_hash: string;
  role: UserRole;
  phone_verified: boolean;
};

export const authRouter = Router();

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

authRouter.post(
  "/register",
  handle(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const confirmPassword =
      typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";
    const phone = normalizePhone(typeof req.body?.phone === "string" ? req.body.phone : "");

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: "Enter your name (2–80 characters)." });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: "Enter a valid local or +972 phone number." });
      return;
    }

    if (password.length < 8 || password.length > 72) {
      res.status(400).json({ error: "Password must be 8–72 characters." });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: "Password confirmation does not match." });
      return;
    }

    try {
      const passwordHash = await hashPassword(password);
      const inserted = await pool.query<UserRow>(
        `INSERT INTO users (name, phone, password_hash, role, phone_verified)
         VALUES ($1, $2, $3, 'customer', FALSE)
         RETURNING id, name, phone, password_hash, role, phone_verified`,
        [name, phone, passwordHash],
      );
      const user = inserted.rows[0];
      await createSession(user.id, res);
      res.status(201).json(toPublicUser(user));
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "An account with this phone number already exists." });
        return;
      }
      throw error;
    }
  }),
);

authRouter.post(
  "/login",
  handle(async (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const phone = normalizePhone(typeof req.body?.phone === "string" ? req.body.phone : "");

    if (!phone || !password) {
      res.status(400).json({ error: "Enter your phone number and password." });
      return;
    }

    const found = await pool.query<UserRow>(
      `SELECT id, name, phone, password_hash, role, phone_verified
       FROM users WHERE phone = $1`,
      [phone],
    );
    const user = found.rows[0];
    const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !passwordOk) {
      res.status(401).json({ error: "Invalid phone number or password." });
      return;
    }

    await createSession(user.id, res);
    res.json(toPublicUser(user));
  }),
);

authRouter.post(
  "/logout",
  handle(async (req, res) => {
    await destroySession(req.cookies?.[SESSION_COOKIE], res);
    res.status(204).send();
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});
