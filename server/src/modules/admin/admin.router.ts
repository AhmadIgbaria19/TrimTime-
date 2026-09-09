import { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { registerAdminBookingRoutes } from "./admin.bookings.js";
import { registerAdminCatalogRoutes } from "./admin.catalog.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/session", (req, res) => {
  res.json({
    ok: true,
    user: req.user,
  });
});

registerAdminCatalogRoutes(adminRouter);
registerAdminBookingRoutes(adminRouter);
