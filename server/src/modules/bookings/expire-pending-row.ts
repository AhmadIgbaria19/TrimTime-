import type { DateTime } from "luxon";
import type { PoolClient } from "pg";

export async function expirePendingRowIfDue(
  client: PoolClient,
  bookingId: number,
  status: string,
  startAt: DateTime,
  now: DateTime,
) {
  if (status !== "Pending" || now < startAt) {
    return false;
  }
  await client.query(
    `UPDATE bookings SET status = 'Expired', updated_at = NOW() WHERE id = $1 AND status = 'Pending'`,
    [bookingId],
  );
  return true;
}
