import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { adminRouter } from "./modules/admin/admin.router.js";
import { authRouter } from "./modules/auth/auth.router.js";
import { availabilityRouter } from "./modules/availability/availability.router.js";
import { bookingsRouter } from "./modules/bookings/bookings.router.js";
import { catalogRouter } from "./modules/catalog/catalog.router.js";

export function createApp() {
  const app = express();
  const clientOrigin = `http://127.0.0.1:${process.env.CLIENT_PORT ?? "3001"}`;

  app.use(
    cors({
      origin: [clientOrigin, "http://localhost:3001", "http://127.0.0.1:3001"],
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "trimtime",
      step: 7,
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/admin", adminRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}
