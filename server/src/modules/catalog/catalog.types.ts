export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type SalonSettings = {
  name: string;
  tagline: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  heroImageUrl: string;
  timezone: string;
  cancellationHours: number;
  bookingHorizonDays: number;
};

export type ServiceRecord = {
  id: number;
  name: string;
  description: string;
  priceIls: number;
  durationMinutes: number;
  active: boolean;
  sortOrder: number;
};

export type BarberRecord = {
  id: number;
  name: string;
  roleTitle: string;
  focus: string;
  photoUrl: string;
  active: boolean;
  sortOrder: number;
  serviceIds: number[];
};

export type WorkingHour = {
  weekday: number;
  startTime: string;
  endTime: string;
};

export type BreakRecord = {
  id: number;
  barberId: number | null;
  weekday: number;
  startTime: string;
  endTime: string;
};

export type TimeOffRecord = {
  id: number;
  barberId: number | null;
  startsOn: string;
  endsOn: string;
  reason: string;
};

export type DateBlockRecord = {
  id: number;
  barberId: number | null;
  onDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export type Catalog = {
  salon: SalonSettings;
  services: ServiceRecord[];
  barbers: BarberRecord[];
  hours: WorkingHour[];
  barberHours: { barberId: number; hours: WorkingHour[] }[];
  breaks: BreakRecord[];
  timeOff: TimeOffRecord[];
  dateBlocks: DateBlockRecord[];
};
