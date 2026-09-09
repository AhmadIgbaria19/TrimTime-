ALTER TABLE salon_settings
  ADD COLUMN IF NOT EXISTS booking_horizon_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE salon_settings
  DROP CONSTRAINT IF EXISTS salon_settings_booking_horizon_days_check;

ALTER TABLE salon_settings
  ADD CONSTRAINT salon_settings_booking_horizon_days_check
  CHECK (booking_horizon_days >= 0 AND booking_horizon_days <= 365);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  barber_id INTEGER NOT NULL REFERENCES barbers (id) ON DELETE RESTRICT,
  service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed', 'NoShow')),
  note TEXT NOT NULL DEFAULT '',
  price_ils INTEGER NOT NULL CHECK (price_ils >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  service_name TEXT NOT NULL,
  barber_name TEXT NOT NULL,
  hold_expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_customer_idempotency_idx
  ON bookings (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_barber_range_idx ON bookings (barber_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings (customer_id, start_at DESC);
