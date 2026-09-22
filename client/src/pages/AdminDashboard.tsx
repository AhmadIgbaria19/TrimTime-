import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminBookings, type AdminBooking } from "../api/auth";
import type { Catalog } from "../api/catalog";
import { useLocale } from "../context/LocaleContext";
import { formatIsoDateLong, formatZonedClock, zonedToday } from "../lib/dates";

const REFRESH_MS = 30000;

function byStart(a: AdminBooking, b: AdminBooking) {
  return new Date(a.start).getTime() - new Date(b.start).getTime() || a.id - b.id;
}

export function AdminDashboard({ catalog }: { catalog: Catalog }) {
  const { t, tApi, intl } = useLocale();
  const timeZone = catalog.salon.timezone || "Asia/Jerusalem";
  const today = zonedToday(timeZone);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  async function reload(quiet = false) {
    if (!quiet) {
      setLoading(true);
    }
    try {
      const data = await fetchAdminBookings();
      setBookings(data.bookings);
      setUpdatedAt(new Date());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("dash.loadFail"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      reload(true).catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const now = Date.now();
  const remainingToday = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === "Confirmed" &&
          booking.localDate === today &&
          new Date(booking.start).getTime() >= now,
      ).sort(byStart),
    [bookings, today, now],
  );
  const completedToday = useMemo(
    () => bookings.filter((booking) => booking.status === "Completed" && booking.localDate === today),
    [bookings, today],
  );
  const pendingAll = useMemo(
    () => bookings.filter((booking) => booking.status === "Pending").sort(byStart),
    [bookings],
  );
  const upcoming = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status === "Confirmed" && new Date(booking.start).getTime() >= now)
        .sort(byStart)
        .slice(0, 8),
    [bookings, now],
  );

  return (
    <div className="desk-shell">
      <header className="desk-top">
        <div>
          <p className="eyebrow">{t("dash.eyebrow")}</p>
          <h1>{t("dash.title")}</h1>
          <p className="desk-date-label">{formatIsoDateLong(today, intl)}</p>
        </div>
        <Link className="desk-add-btn" to="/admin/bookings">
          {t("dash.openSchedule")}
        </Link>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="lede">{t("dash.loading")}</p> : null}

      {!loading ? (
        <>
          <section className="dash-cards" aria-label={t("dash.glance")}>
            <Link className="dash-card" to={`/admin/bookings?tab=schedule&status=Confirmed&date=${today}`}>
              <p className="dash-card-label">{t("dash.remaining")}</p>
              <p className="dash-card-value">{remainingToday.length}</p>
              <p className="dash-card-scope">{t("dash.remainingScope")}</p>
            </Link>
            <Link className="dash-card" to={`/admin/bookings?tab=schedule&status=Completed&date=${today}`}>
              <p className="dash-card-label">{t("dash.completed")}</p>
              <p className="dash-card-value">{completedToday.length}</p>
              <p className="dash-card-scope">{t("dash.completedScope")}</p>
            </Link>
            <Link className="dash-card dash-card-alert" to="/admin/bookings?tab=pending">
              <p className="dash-card-label">{t("dash.pending")}</p>
              <p className="dash-card-value">{pendingAll.length}</p>
              <p className="dash-card-scope">{t("dash.pendingScope")}</p>
            </Link>
          </section>

          {pendingAll.length ? (
            <section className="dash-alert">
              <div className="dash-alert-head">
                <div>
                  <h2>{t("dash.needsDecision")}</h2>
                  <p className="desk-scope">
                    {pendingAll.length === 1 ? t("dash.pendingOne") : t("dash.pendingMany", { n: pendingAll.length })}
                  </p>
                </div>
                <Link className="desk-btn desk-btn-gold" to="/admin/bookings?tab=pending">
                  {t("dash.review")}
                </Link>
              </div>
              <ul className="dash-list">
                {pendingAll.slice(0, 4).map((booking) => (
                  <li key={booking.id}>
                    <div>
                      <p className="desk-customer" dir="auto">
                        {booking.customerName}
                      </p>
                      <p className="booking-meta">
                        {formatIsoDateLong(booking.localDate, intl)} · {booking.localTime}
                        {booking.localEndTime ? `–${booking.localEndTime}` : ""} · {booking.serviceName} ·{" "}
                        {booking.barberName}
                      </p>
                    </div>
                    <span className="status-pill status-pending">{t("status.Pending")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="form-hint">{t("dash.noPending")}</p>
          )}

          <section className="dash-upcoming">
            <div className="desk-top">
              <h2>{t("dash.upcoming")}</h2>
              <p className="desk-updated">
                {updatedAt ? t("dash.updated", { time: formatZonedClock(timeZone, updatedAt) }) : ""}
              </p>
            </div>
            {!upcoming.length ? (
              <p className="lede">{t("dash.noUpcoming")}</p>
            ) : (
              <ul className="dash-list">
                {upcoming.map((booking) => (
                  <li key={booking.id}>
                    <div>
                      <p className="desk-time">
                        <strong>
                          {booking.localTime}
                          {booking.localEndTime ? `–${booking.localEndTime}` : ""}
                        </strong>
                        <span className="cell-sub">{formatIsoDateLong(booking.localDate, intl)}</span>
                      </p>
                      <p className="desk-customer" dir="auto">
                        {booking.customerName}
                      </p>
                      <p className="booking-meta">
                        {booking.serviceName} · {booking.barberName}
                      </p>
                    </div>
                    <Link
                      className="desk-btn desk-btn-solid"
                      to={`/admin/bookings?tab=schedule&status=Confirmed&date=${booking.localDate}`}
                    >
                      {t("dash.viewDay")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
