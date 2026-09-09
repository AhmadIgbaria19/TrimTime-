import { Router } from "express";
import { handle } from "../../lib/http.js";
import { getCatalog } from "./catalog.store.js";

export const catalogRouter = Router();

catalogRouter.get(
  "/",
  handle(async (_req, res) => {
    const catalog = await getCatalog(false);
    if (!catalog) {
      res.status(404).json({ error: "Salon catalog is not ready yet." });
      return;
    }
    res.json(catalog);
  }),
);
