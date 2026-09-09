import { pool } from "./pool.js";

const SALON_HOURS: { weekday: number; start: string; end: string }[] = [
  { weekday: 0, start: "10:00", end: "20:00" },
  { weekday: 1, start: "10:00", end: "20:00" },
  { weekday: 2, start: "10:00", end: "20:00" },
  { weekday: 3, start: "10:00", end: "20:00" },
  { weekday: 4, start: "10:00", end: "21:00" },
  { weekday: 6, start: "09:00", end: "18:00" },
];

export async function seedCatalog() {
  const existing = await pool.query("SELECT 1 FROM salon_settings WHERE id = 1");
  if (existing.rowCount) {
    return;
  }

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO salon_settings (
         id, name, tagline, city, address, phone, email, logo_url, hero_image_url, timezone
       ) VALUES (
         1, 'North Atelier', 'Precision cuts. Quiet luxury.',
         'Al-Masayef, Jerusalem', '12 King Faisal Street',
         '+972 2 555 0148', 'hello@northatelier.demo',
         '', '/images/atelier.jpg', 'Asia/Jerusalem'
       )`,
    );

    const services = await pool.query<{ id: number; name: string }>(
      `INSERT INTO services (name, description, price_ils, duration_minutes, sort_order)
       VALUES
         ('Classic Cut', 'Consultation, scissor work, and a tailored finish.', 90, 30, 1),
         ('Skin Fade', 'Clean blend from skin to length, with a sharp outline.', 110, 40, 2),
         ('Hot Towel Shave', 'Traditional straight-razor shave with hot towels.', 80, 30, 3),
         ('Beard Sculpt', 'Line-up, shape, and conditioning for a defined beard.', 70, 25, 4)
       RETURNING id, name`,
    );

    const barbers = await pool.query<{ id: number; name: string }>(
      `INSERT INTO barbers (name, role_title, focus, photo_url, sort_order)
       VALUES
         ('Adam Nassar', 'Master barber', 'Fades & classic cuts', '/images/barber-one.jpg', 1),
         ('Lina Haddad', 'Senior stylist', 'Texture & beard work', '/images/barber-two.jpg', 2),
         ('Omar Saleh', 'Barber', 'Skin fades & outlines', '', 3)
       RETURNING id, name`,
    );

    const serviceId = Object.fromEntries(services.rows.map((row) => [row.name, row.id]));
    const barberId = Object.fromEntries(barbers.rows.map((row) => [row.name, row.id]));

    const links: [string, string[]][] = [
      ["Adam Nassar", ["Classic Cut", "Skin Fade", "Hot Towel Shave", "Beard Sculpt"]],
      ["Lina Haddad", ["Classic Cut", "Hot Towel Shave", "Beard Sculpt"]],
      ["Omar Saleh", ["Classic Cut", "Skin Fade"]],
    ];

    for (const [barberName, serviceNames] of links) {
      for (const serviceName of serviceNames) {
        await pool.query(
          "INSERT INTO barber_services (barber_id, service_id) VALUES ($1, $2)",
          [barberId[barberName], serviceId[serviceName]],
        );
      }
    }

    for (const hour of SALON_HOURS) {
      await pool.query(
        `INSERT INTO working_hours (barber_id, weekday, start_time, end_time)
         VALUES (NULL, $1, $2, $3)`,
        [hour.weekday, hour.start, hour.end],
      );
      for (const barber of barbers.rows) {
        await pool.query(
          `INSERT INTO working_hours (barber_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [barber.id, hour.weekday, hour.start, hour.end],
        );
      }
    }

    await pool.query("COMMIT");
    console.log("Seeded salon catalog");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}
