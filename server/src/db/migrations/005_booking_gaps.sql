ALTER TABLE bookings
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_name TEXT NOT NULL DEFAULT '';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_phone TEXT NOT NULL DEFAULT '';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_role TEXT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed', 'NoShow', 'Expired'));

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_cancelled_by_role_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_cancelled_by_role_check
  CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('customer', 'admin'));

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_party_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_party_check
  CHECK (
    (customer_id IS NOT NULL AND guest_name = '' AND guest_phone = '')
    OR (customer_id IS NULL AND guest_name <> '' AND guest_phone <> '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS bookings_guest_idempotency_idx
  ON bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND customer_id IS NULL;

UPDATE bookings
  SET hold_expires_at = start_at
  WHERE status = 'Pending' AND hold_expires_at IS NULL;
