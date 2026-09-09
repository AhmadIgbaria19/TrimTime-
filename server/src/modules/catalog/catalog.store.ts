import { pool } from "../../db/pool.js";
import type {
  BarberRecord,
  BreakRecord,
  Catalog,
  DateBlockRecord,
  SalonSettings,
  ServiceRecord,
  TimeOffRecord,
  WorkingHour,
} from "./catalog.types.js";

type SalonRow = {
  name: string;
  tagline: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  hero_image_url: string;
  timezone: string;
  cancellation_hours: number;
  booking_horizon_days: number;
};

type ServiceRow = {
  id: number;
  name: string;
  description: string;
  price_ils: number;
  duration_minutes: number;
  active: boolean;
  sort_order: number;
};

type BarberRow = {
  id: number;
  name: string;
  role_title: string;
  focus: string;
  photo_url: string;
  active: boolean;
  sort_order: number;
};

type HourRow = {
  barber_id: number | null;
  weekday: number;
  start_time: string;
  end_time: string;
};

type BreakRow = {
  id: number;
  barber_id: number | null;
  weekday: number;
  start_time: string;
  end_time: string;
};

type TimeOffRow = {
  id: number;
  barber_id: number | null;
  starts_on: string;
  ends_on: string;
  reason: string;
};

type DateBlockRow = {
  id: number;
  barber_id: number | null;
  on_date: string;
  start_time: string;
  end_time: string;
  reason: string;
};

function mapSalon(row: SalonRow): SalonSettings {
  return {
    name: row.name,
    tagline: row.tagline,
    city: row.city,
    address: row.address,
    phone: row.phone,
    email: row.email,
    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    timezone: row.timezone,
    cancellationHours: row.cancellation_hours,
    bookingHorizonDays: row.booking_horizon_days,
  };
}

function mapService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceIls: row.price_ils,
    durationMinutes: row.duration_minutes,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

function mapBarber(row: BarberRow, serviceIds: number[]): BarberRecord {
  return {
    id: row.id,
    name: row.name,
    roleTitle: row.role_title,
    focus: row.focus,
    photoUrl: row.photo_url,
    active: row.active,
    sortOrder: row.sort_order,
    serviceIds,
  };
}

function mapHour(row: HourRow): WorkingHour {
  return {
    weekday: Number(row.weekday),
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  };
}

const HOUR_SQL = `
  SELECT barber_id, weekday, to_char(start_time, 'HH24:MI') AS start_time,
         to_char(end_time, 'HH24:MI') AS end_time
  FROM working_hours
  ORDER BY weekday, start_time
`;

export async function getCatalog(includeInactive = false): Promise<Catalog | null> {
  const salonResult = await pool.query<SalonRow>(
    `SELECT name, tagline, city, address, phone, email, logo_url, hero_image_url,
            timezone, cancellation_hours, booking_horizon_days
     FROM salon_settings WHERE id = 1`,
  );
  const salonRow = salonResult.rows[0];
  if (!salonRow) {
    return null;
  }

  const serviceFilter = includeInactive ? "" : "WHERE active = TRUE";
  const barberFilter = includeInactive ? "" : "WHERE active = TRUE";

  const [servicesResult, barbersResult, hoursResult, linksResult, breaksResult, timeOffResult, dateBlockResult] =
    await Promise.all([
      pool.query<ServiceRow>(
        `SELECT id, name, description, price_ils, duration_minutes, active, sort_order
         FROM services ${serviceFilter} ORDER BY sort_order, id`,
      ),
      pool.query<BarberRow>(
        `SELECT id, name, role_title, focus, photo_url, active, sort_order
         FROM barbers ${barberFilter} ORDER BY sort_order, id`,
      ),
      pool.query<HourRow>(HOUR_SQL),
      pool.query<{ barber_id: number; service_id: number }>(
        "SELECT barber_id, service_id FROM barber_services",
      ),
      pool.query<BreakRow>(
        `SELECT id, barber_id, weekday,
                to_char(start_time, 'HH24:MI') AS start_time,
                to_char(end_time, 'HH24:MI') AS end_time
         FROM schedule_breaks ORDER BY weekday, start_time, id`,
      ),
      pool.query<TimeOffRow>(
        `SELECT id, barber_id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
                to_char(ends_on, 'YYYY-MM-DD') AS ends_on, reason
         FROM time_off ORDER BY starts_on, id`,
      ),
      pool.query<DateBlockRow>(
        `SELECT id, barber_id, to_char(on_date, 'YYYY-MM-DD') AS on_date,
                to_char(start_time, 'HH24:MI') AS start_time,
                to_char(end_time, 'HH24:MI') AS end_time, reason
         FROM date_blocks ORDER BY on_date, start_time, id`,
      ),
    ]);

  const links = new Map<number, number[]>();
  for (const link of linksResult.rows) {
    const list = links.get(link.barber_id) ?? [];
    list.push(link.service_id);
    links.set(link.barber_id, list);
  }

  const salonHours = hoursResult.rows.filter((row) => row.barber_id === null).map(mapHour);
  const barberHoursMap = new Map<number, WorkingHour[]>();
  for (const row of hoursResult.rows) {
    if (row.barber_id === null) {
      continue;
    }
    const list = barberHoursMap.get(row.barber_id) ?? [];
    list.push(mapHour(row));
    barberHoursMap.set(row.barber_id, list);
  }

  const breaks: BreakRecord[] = breaksResult.rows.map((row) => ({
    id: row.id,
    barberId: row.barber_id,
    weekday: Number(row.weekday),
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  }));

  const timeOff: TimeOffRecord[] = timeOffResult.rows.map((row) => ({
    id: row.id,
    barberId: row.barber_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reason: row.reason,
  }));

  const dateBlocks: DateBlockRecord[] = dateBlockResult.rows.map((row) => ({
    id: row.id,
    barberId: row.barber_id,
    onDate: row.on_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    reason: row.reason,
  }));

  return {
    salon: mapSalon(salonRow),
    services: servicesResult.rows.map(mapService),
    barbers: barbersResult.rows.map((row) => mapBarber(row, links.get(row.id) ?? [])),
    hours: salonHours,
    barberHours: [...barberHoursMap.entries()].map(([barberId, hours]) => ({ barberId, hours })),
    breaks,
    timeOff,
    dateBlocks,
  };
}
