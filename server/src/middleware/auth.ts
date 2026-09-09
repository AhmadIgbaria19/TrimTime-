import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, findUserBySessionToken } from "../lib/session.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }

    const user = await findUserBySessionToken(token);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  if (req.user.role !== "customer") {
    res.status(403).json({ error: "Admin accounts cannot use customer booking. Add visits from Manage bookings." });
    return;
  }

  next();
}
