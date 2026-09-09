import "./config.js";
import { createApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { seedAdmin } from "./db/seed-admin.js";
import { seedCatalog } from "./db/seed-catalog.js";
import { expireDuePending, startPendingExpiryLoop } from "./modules/bookings/expire-pending.js";

async function start() {
  await migrate();
  await seedAdmin();
  await seedCatalog();
  const expired = await expireDuePending();
  if (expired.length) {
    console.log(`Expired ${expired.length} pending booking(s) that had already started.`);
  }
  startPendingExpiryLoop();

  const port = Number(process.env.API_PORT ?? 4000);
  const app = createApp();

  app.listen(port, "127.0.0.1", () => {
    console.log(`TrimTime API running at http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
