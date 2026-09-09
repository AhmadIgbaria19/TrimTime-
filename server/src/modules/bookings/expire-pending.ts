import { pool } from "../../db/pool.js";

export async function expireDuePending(now = new Date()) {
  const result = await pool.query<{ id: number }>(
    `UPDATE bookings
     SET status = 'Expired', updated_at = NOW()
     WHERE status = 'Pending' AND start_at <= $1
     RETURNING id`,
    [now],
  );
  return result.rows.map((row) => row.id);
}

export function startPendingExpiryLoop(intervalMs = 15_000) {
  const timer = setInterval(() => {
    expireDuePending().catch((error) => {
      console.error("Pending expiry failed", error);
    });
  }, intervalMs);
  timer.unref?.();
  return timer;
}
