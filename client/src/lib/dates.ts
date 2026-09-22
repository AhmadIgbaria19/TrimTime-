export function zonedToday(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addIsoDays(iso: string, days: number) {
  const { year, month, day } = parseIsoDate(iso);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return toIso(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdaySun0(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isoWeekdaySun0(iso: string) {
  const { year, month, day } = parseIsoDate(iso);
  return weekdaySun0(year, month, day);
}

export function formatIsoDateLong(iso: string, locale = "en-US") {
  const { year, month, day } = parseIsoDate(iso);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function monthLabel(year: number, month: number, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function shiftMonth(year: number, month: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1 };
}

export function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
    if (dates.length > 400) {
      break;
    }
  }
  return dates;
}

export function formatZonedClock(timeZone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

export function monthOverlapsWindow(year: number, month: number, first: string, last: string) {
  const start = toIso(year, month, 1);
  const end = toIso(year, month, daysInMonth(year, month));
  return end >= first && start <= last;
}
