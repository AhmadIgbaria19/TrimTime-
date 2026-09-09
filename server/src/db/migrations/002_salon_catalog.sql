CREATE TABLE salon_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  hero_image_url TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  cancellation_hours INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_ils INTEGER NOT NULL CHECK (price_ils >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE barbers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE barber_services (
  barber_id INTEGER NOT NULL REFERENCES barbers (id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  PRIMARY KEY (barber_id, service_id)
);

CREATE TABLE working_hours (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER REFERENCES barbers (id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time)
);

CREATE UNIQUE INDEX working_hours_salon_weekday_idx
  ON working_hours (weekday)
  WHERE barber_id IS NULL;

CREATE UNIQUE INDEX working_hours_barber_weekday_idx
  ON working_hours (barber_id, weekday)
  WHERE barber_id IS NOT NULL;

CREATE TABLE schedule_breaks (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER REFERENCES barbers (id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (start_time < end_time)
);

CREATE TABLE time_off (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER REFERENCES barbers (id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  CHECK (starts_on <= ends_on)
);
