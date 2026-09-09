CREATE TABLE date_blocks (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER REFERENCES barbers (id) ON DELETE CASCADE,
  on_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  CHECK (start_time < end_time)
);

CREATE INDEX date_blocks_date_idx ON date_blocks (on_date);
