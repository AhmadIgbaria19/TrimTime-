import type { Catalog } from "./catalog";

export type UserRole = "customer" | "admin";

export type PublicUser = {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  phoneVerified: boolean;
};

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    ...rest,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export function fetchMe() {
  return fetch("/api/auth/me", { credentials: "include" }).then(async (response) => {
    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error("Could not load session");
    }
    return (await response.json()) as PublicUser;
  });
}

export function registerAccount(body: {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
}) {
  return apiRequest<PublicUser>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function loginAccount(body: { phone: string; password: string }) {
  return apiRequest<PublicUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logoutAccount() {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export function fetchAdminSession() {
  return apiRequest<{ ok: boolean; user: PublicUser }>("/api/admin/session");
}

export type PublicBooking = {
  id: number;
  status: string;
  serviceName: string;
  barberName: string;
  start: string;
  end?: string;
  localDate: string;
  localTime: string;
  localEndTime?: string;
  durationMinutes: number;
  priceIls: number;
  note: string;
  cancellable: boolean;
  cancelledBy?: "customer" | "admin" | null;
  cancelledReason?: string;
};

export function fetchMyBookings() {
  return apiRequest<{ cancellationHours: number; bookings: PublicBooking[] }>("/api/bookings");
}

export function cancelBooking(id: number) {
  return apiRequest<PublicBooking>(`/api/bookings/${id}/cancel`, { method: "POST" });
}

export function createBooking(body: {
  serviceId: number;
  barberId: number;
  start: string;
  note: string;
  idempotencyKey: string;
}) {
  return apiRequest<PublicBooking>("/api/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": body.idempotencyKey },
    body: JSON.stringify({
      serviceId: body.serviceId,
      barberId: body.barberId,
      start: body.start,
      note: body.note,
    }),
  });
}

export function fetchPublicCatalog() {
  return apiRequest<Catalog>("/api/catalog");
}

export function fetchAdminCatalog() {
  return apiRequest<Catalog>("/api/admin/catalog");
}

export function saveAdminSalon(body: Record<string, unknown>) {
  return apiRequest<Catalog>("/api/admin/salon", { method: "PATCH", body: JSON.stringify(body) });
}

export function saveAdminService(body: Record<string, unknown>, id?: number) {
  return apiRequest<Catalog>(id ? `/api/admin/services/${id}` : "/api/admin/services", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAdminService(id: number) {
  return apiRequest<Catalog>(`/api/admin/services/${id}`, { method: "DELETE" });
}

export function saveAdminBarber(body: Record<string, unknown>, id?: number) {
  return apiRequest<Catalog>(id ? `/api/admin/barbers/${id}` : "/api/admin/barbers", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAdminBarber(id: number) {
  return apiRequest<Catalog>(`/api/admin/barbers/${id}`, { method: "DELETE" });
}

export function saveAdminHours(body: { barberId: number | null; hours: { weekday: number; startTime: string; endTime: string }[] }) {
  return apiRequest<Catalog>("/api/admin/hours", { method: "PUT", body: JSON.stringify(body) });
}

export function addAdminBreak(body: Record<string, unknown>) {
  return apiRequest<Catalog>("/api/admin/breaks", { method: "POST", body: JSON.stringify(body) });
}

export function deleteAdminBreak(id: number) {
  return apiRequest<Catalog>(`/api/admin/breaks/${id}`, { method: "DELETE" });
}

export function addAdminTimeOff(body: Record<string, unknown>) {
  return apiRequest<Catalog>("/api/admin/time-off", { method: "POST", body: JSON.stringify(body) });
}

export function deleteAdminTimeOff(id: number) {
  return apiRequest<Catalog>(`/api/admin/time-off/${id}`, { method: "DELETE" });
}

export function addAdminDateBlock(body: Record<string, unknown>) {
  return apiRequest<Catalog>("/api/admin/date-blocks", { method: "POST", body: JSON.stringify(body) });
}

export function deleteAdminDateBlock(id: number) {
  return apiRequest<Catalog>(`/api/admin/date-blocks/${id}`, { method: "DELETE" });
}

export type AdminBookingAction = "confirm" | "reject" | "complete" | "no-show" | "cancel";

export type AdminBooking = PublicBooking & {
  customerName: string;
  customerPhone: string;
  serviceId: number;
  barberId: number;
  isGuest?: boolean;
  actions: Array<{ action: AdminBookingAction; enabled: boolean; reason?: string }>;
};

export function fetchAdminBookings() {
  return apiRequest<{ cancellationHours: number; bookings: AdminBooking[] }>("/api/admin/bookings");
}

export type AdminCustomer = {
  id: number;
  name: string;
  phone: string;
};

export function fetchAdminCustomers(query = "") {
  const q = query.trim();
  const path = q ? `/api/admin/customers?q=${encodeURIComponent(q)}` : "/api/admin/customers";
  return apiRequest<{ customers: AdminCustomer[] }>(path);
}

export function createAdminBooking(body: {
  customerId?: number | null;
  guestName?: string;
  guestPhone?: string;
  serviceId: number;
  barberId: number;
  start: string;
  note: string;
  idempotencyKey: string;
}) {
  return apiRequest<AdminBooking>("/api/admin/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": body.idempotencyKey },
    body: JSON.stringify({
      customerId: body.customerId ?? null,
      guestName: body.guestName,
      guestPhone: body.guestPhone,
      serviceId: body.serviceId,
      barberId: body.barberId,
      start: body.start,
      note: body.note,
    }),
  });
}

export function runAdminBookingAction(id: number, action: AdminBookingAction, body?: { reason?: string }) {
  return apiRequest<AdminBooking>(`/api/admin/bookings/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}
