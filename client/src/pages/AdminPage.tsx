import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  addAdminBreak,
  addAdminDateBlock,
  addAdminTimeOff,
  deleteAdminBarber,
  deleteAdminBreak,
  deleteAdminDateBlock,
  deleteAdminService,
  deleteAdminTimeOff,
  fetchAdminCatalog,
  fetchAdminSession,
  saveAdminBarber,
  saveAdminHours,
  saveAdminSalon,
  saveAdminService,
} from "../api/auth";
import { WEEKDAYS, type Catalog, type WorkingHour } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";
import { weekdayKey } from "../i18n/messages";
import { AdminBookingsPanel } from "./AdminBookingsPanel";
import { AdminDashboard } from "./AdminDashboard";

type Tab = "salon" | "services" | "barbers" | "hours";

export function AdminPage() {
  const { user, loading } = useAuth();
  const { reload } = useSalon();
  const { t, tApi } = useLocale();
  const location = useLocation();
  const manageBookings = location.pathname.startsWith("/admin/bookings");
  const settingsPath = location.pathname.startsWith("/admin/settings");
  const settingsMatch = location.pathname.match(/^\/admin\/settings\/(salon|services|barbers|hours)$/);
  const settingsSection: Tab = (settingsMatch?.[1] as Tab | undefined) ?? "salon";
  const [allowed, setAllowed] = useState(false);
  const [apiError, setApiError] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) {
      return;
    }
    fetchAdminSession()
      .then(async () => {
        setAllowed(true);
        setCatalog(await fetchAdminCatalog());
      })
      .catch((err) => {
        setAllowed(false);
        setApiError(err instanceof Error ? tApi(err.message) : t("admin.accessRequired"));
      });
  }, [loading, user]);

  async function apply(next: Catalog) {
    setCatalog(next);
    setError("");
    setMessage(t("admin.saved"));
    await reload();
  }

  async function run(action: () => Promise<Catalog>) {
    setMessage("");
    setError("");
    try {
      await apply(await action());
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("admin.saveFail"));
    }
  }

  if (loading || (allowed && !catalog)) {
    return (
      <main className="auth-page">
        <p>{t("loadingSession")}</p>
      </main>
    );
  }

  if (user?.role === "customer") {
    return <Navigate to="/" replace />;
  }

  if (!allowed || !catalog) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">{t("admin.restricted")}</p>
          <h1>{t("admin.only")}</h1>
          <p className="lede">
            {apiError || t("admin.onlyLede")}
          </p>
          <Link className="btn btn-gold" to={user ? "/" : "/login"}>
            {user ? t("admin.backSalon") : t("auth.signIn")}
          </Link>
        </section>
      </main>
    );
  }

  if (manageBookings) {
    return <AdminBookingsPanel catalog={catalog} />;
  }

  if (location.pathname === "/admin/settings" || (settingsPath && !settingsMatch)) {
    return <Navigate to="/admin/settings/salon" replace />;
  }

  if (!settingsPath) {
    return <AdminDashboard catalog={catalog} />;
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <p className="eyebrow">{t("admin.owner")}</p>
        <h1>{t("admin.settings")}</h1>
        <p className="lede">{t("admin.settingsLede", { name: user?.name ?? "" })}</p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-hint">{message}</p> : null}

      <div className="admin-tabs" role="tablist">
        {(
          [
            ["salon", t("admin.tabSalon")],
            ["services", t("admin.tabServices")],
            ["barbers", t("admin.tabBarbers")],
            ["hours", t("admin.tabHours")],
          ] as const
        ).map(([id, label]) => (
          <NavLink
            key={id}
            className={({ isActive }) => (isActive ? "tab active" : "tab")}
            to={`/admin/settings/${id}`}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {settingsSection === "salon" ? (
        <SalonPanel catalog={catalog} onSave={(body) => run(() => saveAdminSalon(body))} />
      ) : null}
      {settingsSection === "services" ? (
        <ServicesPanel
          catalog={catalog}
          onSave={(body, id) => run(() => saveAdminService(body, id))}
          onDelete={(id) => run(() => deleteAdminService(id))}
        />
      ) : null}
      {settingsSection === "barbers" ? (
        <BarbersPanel
          catalog={catalog}
          onSave={(body, id) => run(() => saveAdminBarber(body, id))}
          onDelete={(id) => run(() => deleteAdminBarber(id))}
        />
      ) : null}
      {settingsSection === "hours" ? (
        <HoursPanel
          catalog={catalog}
          onSaveHours={(body) => run(() => saveAdminHours(body))}
          onAddBreak={(body) => run(() => addAdminBreak(body))}
          onDeleteBreak={(id) => run(() => deleteAdminBreak(id))}
          onAddTimeOff={(body) => run(() => addAdminTimeOff(body))}
          onDeleteTimeOff={(id) => run(() => deleteAdminTimeOff(id))}
          onAddDateBlock={(body) => run(() => addAdminDateBlock(body))}
          onDeleteDateBlock={(id) => run(() => deleteAdminDateBlock(id))}
        />
      ) : null}
    </main>
  );
}

function SalonPanel({
  catalog,
  onSave,
}: {
  catalog: Catalog;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const salon = catalog.salon;
  const { t } = useLocale();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      name: String(form.get("name") ?? ""),
      tagline: String(form.get("tagline") ?? ""),
      city: String(form.get("city") ?? ""),
      address: String(form.get("address") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      logoUrl: String(form.get("logoUrl") ?? ""),
      heroImageUrl: String(form.get("heroImageUrl") ?? ""),
      cancellationHours: Number(form.get("cancellationHours") ?? 2),
      bookingHorizonDays: Number(form.get("bookingHorizonDays") ?? 30),
    });
  }

  return (
    <form className="admin-card auth-form" onSubmit={onSubmit}>
      <label>
        {t("admin.salonName")}
        <input name="name" defaultValue={salon.name} required />
      </label>
      <label>
        {t("admin.tagline")}
        <input name="tagline" defaultValue={salon.tagline} />
      </label>
      <label>
        {t("admin.city")}
        <input name="city" defaultValue={salon.city} />
      </label>
      <label>
        {t("admin.address")}
        <input name="address" defaultValue={salon.address} />
      </label>
      <label>
        {t("phone")}
        <input name="phone" defaultValue={salon.phone} />
      </label>
      <label>
        {t("admin.email")}
        <input name="email" type="email" defaultValue={salon.email} />
      </label>
      <label>
        {t("admin.logoUrl")}
        <input name="logoUrl" defaultValue={salon.logoUrl} placeholder="/images/atelier.jpg" />
      </label>
      <label>
        {t("admin.heroUrl")}
        <input name="heroImageUrl" defaultValue={salon.heroImageUrl} />
      </label>
      <label>
        {t("admin.cancelHours")}
        <input name="cancellationHours" type="number" min={0} defaultValue={salon.cancellationHours} />
      </label>
      <label>
        {t("admin.bookingWindow")}
        <input name="bookingHorizonDays" type="number" min={0} max={365} defaultValue={salon.bookingHorizonDays} />
      </label>
      <button className="btn btn-gold" type="submit">
        {t("admin.saveSalon")}
      </button>
    </form>
  );
}

function ServicesPanel({
  catalog,
  onSave,
  onDelete,
}: {
  catalog: Catalog;
  onSave: (body: Record<string, unknown>, id?: number) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useLocale();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const editing = catalog.services.find((service) => service.id === editingId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave(
      {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        priceIls: Number(form.get("priceIls") ?? 0),
        durationMinutes: Number(form.get("durationMinutes") ?? 0),
        active: form.get("active") === "on",
        sortOrder: Number(form.get("sortOrder") ?? 0),
      },
      typeof editingId === "number" ? editingId : undefined,
    );
    setEditingId(null);
  }

  return (
    <section className="admin-card">
      <ul className="admin-list">
        {catalog.services.map((service) => (
          <li key={service.id}>
            <div>
              <strong>{service.name}</strong>
              <span>
                {t("admin.serviceMeta", { n: service.durationMinutes, price: service.priceIls })}
                {service.active ? "" : t("admin.hiddenMark")}
              </span>
            </div>
            <div className="admin-actions">
              <button className="text-btn" type="button" onClick={() => setEditingId(service.id)}>
                {t("edit")}
              </button>
              <button className="text-btn" type="button" onClick={() => onDelete(service.id)}>
                {t("delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost" type="button" onClick={() => setEditingId("new")}>
        {t("admin.addService")}
      </button>
      {editingId ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            {t("name")}
            <input name="name" defaultValue={editing?.name ?? ""} required />
          </label>
          <label>
            {t("admin.description")}
            <textarea name="description" rows={3} defaultValue={editing?.description ?? ""} />
          </label>
          <label>
            {t("admin.priceIls")}
            <input name="priceIls" type="number" min={0} defaultValue={editing?.priceIls ?? 80} required />
          </label>
          <label>
            {t("admin.durationField")}
            <input
              name="durationMinutes"
              type="number"
              min={5}
              defaultValue={editing?.durationMinutes ?? 30}
              required
            />
          </label>
          <label>
            {t("admin.sort")}
            <input name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? catalog.services.length + 1} />
          </label>
          <label className="check-label">
            <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> {t("admin.visible")}
          </label>
          <button className="btn btn-gold" type="submit">
            {t("admin.saveService")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function BarbersPanel({
  catalog,
  onSave,
  onDelete,
}: {
  catalog: Catalog;
  onSave: (body: Record<string, unknown>, id?: number) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useLocale();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const editing = catalog.barbers.find((barber) => barber.id === editingId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const serviceIds = catalog.services
      .filter((service) => form.get(`service-${service.id}`) === "on")
      .map((service) => service.id);
    onSave(
      {
        name: String(form.get("name") ?? ""),
        roleTitle: String(form.get("roleTitle") ?? ""),
        focus: String(form.get("focus") ?? ""),
        photoUrl: String(form.get("photoUrl") ?? ""),
        active: form.get("active") === "on",
        sortOrder: Number(form.get("sortOrder") ?? 0),
        serviceIds,
      },
      typeof editingId === "number" ? editingId : undefined,
    );
    setEditingId(null);
  }

  return (
    <section className="admin-card">
      <ul className="admin-list">
        {catalog.barbers.map((barber) => (
          <li key={barber.id}>
            <div>
              <strong>{barber.name}</strong>
              <span>
                {barber.roleTitle}
                {barber.active ? "" : t("admin.hiddenMark")}
              </span>
            </div>
            <div className="admin-actions">
              <button className="text-btn" type="button" onClick={() => setEditingId(barber.id)}>
                {t("edit")}
              </button>
              <button className="text-btn" type="button" onClick={() => onDelete(barber.id)}>
                {t("delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost" type="button" onClick={() => setEditingId("new")}>
        {t("admin.addBarber")}
      </button>
      {editingId ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            {t("name")}
            <input name="name" defaultValue={editing?.name ?? ""} required />
          </label>
          <label>
            {t("admin.role")}
            <input name="roleTitle" defaultValue={editing?.roleTitle ?? ""} />
          </label>
          <label>
            {t("admin.focus")}
            <input name="focus" defaultValue={editing?.focus ?? ""} />
          </label>
          <label>
            {t("admin.photoUrl")}
            <input name="photoUrl" defaultValue={editing?.photoUrl ?? ""} placeholder="/images/barber-one.jpg" />
          </label>
          <p className="form-hint">{t("admin.barberServices")}</p>
          {catalog.services.map((service) => (
            <label key={service.id} className="check-label">
              <input
                name={`service-${service.id}`}
                type="checkbox"
                defaultChecked={editing?.serviceIds.includes(service.id) ?? false}
              />
              {service.name}
            </label>
          ))}
          <label>
            {t("admin.sort")}
            <input name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? catalog.barbers.length + 1} />
          </label>
          <label className="check-label">
            <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> {t("admin.visible")}
          </label>
          <button className="btn btn-gold" type="submit">
            {t("admin.saveBarber")}
          </button>
        </form>
      ) : null}
    </section>
  );
}

function HoursPanel({
  catalog,
  onSaveHours,
  onAddBreak,
  onDeleteBreak,
  onAddTimeOff,
  onDeleteTimeOff,
  onAddDateBlock,
  onDeleteDateBlock,
}: {
  catalog: Catalog;
  onSaveHours: (body: { barberId: number | null; hours: WorkingHour[] }) => void;
  onAddBreak: (body: Record<string, unknown>) => void;
  onDeleteBreak: (id: number) => void;
  onAddTimeOff: (body: Record<string, unknown>) => void;
  onDeleteTimeOff: (id: number) => void;
  onAddDateBlock: (body: Record<string, unknown>) => void;
  onDeleteDateBlock: (id: number) => void;
}) {
  const { t } = useLocale();
  const [scope, setScope] = useState<string>("salon");
  const barberId = scope === "salon" ? null : Number(scope);
  const currentHours = useMemo(() => {
    if (barberId === null) {
      return catalog.hours;
    }
    return catalog.barberHours.find((row) => row.barberId === barberId)?.hours ?? [];
  }, [barberId, catalog]);
  const byDay = new Map(currentHours.map((hour) => [hour.weekday, hour]));

  function onSubmitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hours: WorkingHour[] = [];
    WEEKDAYS.forEach((_, weekday) => {
      if (form.get(`open-${weekday}`) !== "on") {
        return;
      }
      hours.push({
        weekday,
        startTime: String(form.get(`start-${weekday}`) ?? "10:00"),
        endTime: String(form.get(`end-${weekday}`) ?? "20:00"),
      });
    });
    onSaveHours({ barberId, hours });
  }

  function onSubmitBreak(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAddBreak({
      barberId,
      weekday: Number(form.get("weekday")),
      startTime: String(form.get("startTime")),
      endTime: String(form.get("endTime")),
    });
    event.currentTarget.reset();
  }

  function onSubmitTimeOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAddTimeOff({
      barberId,
      startsOn: String(form.get("startsOn")),
      endsOn: String(form.get("endsOn")),
      reason: String(form.get("reason")),
    });
    event.currentTarget.reset();
  }

  function onSubmitDateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAddDateBlock({
      barberId,
      onDate: String(form.get("onDate")),
      startTime: String(form.get("blockStart")),
      endTime: String(form.get("blockEnd")),
      reason: String(form.get("blockReason")),
    });
    event.currentTarget.reset();
  }

  const scopedBreaks = catalog.breaks.filter((item) => item.barberId === barberId);
  const scopedTimeOff = catalog.timeOff.filter((item) => item.barberId === barberId);
  const scopedBlocks = (catalog.dateBlocks ?? []).filter((item) => item.barberId === barberId);

  return (
    <section className="admin-card">
      <label>
        {t("admin.applyTo")}
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="salon">{t("admin.wholeSalon")}</option>
          {catalog.barbers.map((barber) => (
            <option key={barber.id} value={String(barber.id)}>
              {barber.name}
            </option>
          ))}
        </select>
      </label>

      <form className="hours-editor" key={scope} onSubmit={onSubmitHours}>
        {WEEKDAYS.map((day, weekday) => {
          const hour = byDay.get(weekday);
          return (
            <div key={day} className="hours-row">
              <label className="check-label">
                <input name={`open-${weekday}`} type="checkbox" defaultChecked={Boolean(hour)} />
                {t(weekdayKey(weekday))}
              </label>
              <input name={`start-${weekday}`} type="time" defaultValue={hour?.startTime ?? "10:00"} />
              <input name={`end-${weekday}`} type="time" defaultValue={hour?.endTime ?? "20:00"} />
            </div>
          );
        })}
        <button className="btn btn-gold" type="submit">
          {t("admin.saveHours")}
        </button>
      </form>

      <h3>{t("admin.breaks")}</h3>
      <ul className="admin-list">
        {scopedBreaks.map((item) => (
          <li key={item.id}>
            <span>
              {WEEKDAYS[item.weekday] ? t(weekdayKey(item.weekday)) : ""} {item.startTime}–{item.endTime}
            </span>
            <button className="text-btn" type="button" onClick={() => onDeleteBreak(item.id)}>
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={onSubmitBreak}>
        <select name="weekday" defaultValue="0">
          {WEEKDAYS.map((day, weekday) => (
            <option key={day} value={weekday}>
              {t(weekdayKey(weekday))}
            </option>
          ))}
        </select>
        <input name="startTime" type="time" required />
        <input name="endTime" type="time" required />
        <button className="btn btn-ghost" type="submit">
          {t("admin.addBreak")}
        </button>
      </form>

      <h3>{t("admin.closedDates")}</h3>
      <p className="form-hint">{t("admin.closedDatesHint")}</p>
      <ul className="admin-list">
        {scopedTimeOff.map((item) => (
          <li key={item.id}>
            <span>
              {item.startsOn}
              {item.endsOn !== item.startsOn ? ` → ${item.endsOn}` : ""}
              {item.reason ? ` · ${item.reason}` : ""}
            </span>
            <button className="text-btn" type="button" onClick={() => onDeleteTimeOff(item.id)}>
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={onSubmitTimeOff}>
        <input name="startsOn" type="date" required />
        <input name="endsOn" type="date" required />
        <input name="reason" placeholder={t("admin.reasonOptional")} />
        <button className="btn btn-ghost" type="submit">
          {t("admin.closeDates")}
        </button>
      </form>

      <h3>{t("admin.closedHours")}</h3>
      <p className="form-hint">{t("admin.closedHoursHint")}</p>
      <ul className="admin-list">
        {scopedBlocks.map((item) => (
          <li key={item.id}>
            <span>
              {item.onDate} {item.startTime}–{item.endTime}
              {item.reason ? ` · ${item.reason}` : ""}
            </span>
            <button className="text-btn" type="button" onClick={() => onDeleteDateBlock(item.id)}>
              {t("remove")}
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={onSubmitDateBlock}>
        <input name="onDate" type="date" required />
        <input name="blockStart" type="time" required />
        <input name="blockEnd" type="time" required />
        <input name="blockReason" placeholder={t("admin.reasonOptional")} />
        <button className="btn btn-ghost" type="submit">
          {t("admin.closeHours")}
        </button>
      </form>
    </section>
  );
}
