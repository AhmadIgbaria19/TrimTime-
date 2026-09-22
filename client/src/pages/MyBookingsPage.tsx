import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cancelBooking, fetchMyBookings, type PublicBooking } from "../api/auth";
import { formatPrice } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { statusKey } from "../i18n/messages";
import { formatIsoDateLong } from "../lib/dates";

type ViewTab = "upcoming" | "history";

function isOpenVisit(booking: PublicBooking) {
  return booking.status === "Pending" || booking.status === "Confirmed";
}

function byStartAsc(a: PublicBooking, b: PublicBooking) {
  return new Date(a.start).getTime() - new Date(b.start).getTime() || a.id - b.id;
}

function byStartDesc(a: PublicBooking, b: PublicBooking) {
  return new Date(b.start).getTime() - new Date(a.start).getTime() || b.id - a.id;
}

export function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, tApi, intl } = useLocale();
  const [bookings, setBookings] = useState<PublicBooking[]>([]);
  const [cancellationHours, setCancellationHours] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [tab, setTab] = useState<ViewTab>("upcoming");

  useEffect(() => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMyBookings()
      .then((data) => {
        setBookings(data.bookings);
        setCancellationHours(data.cancellationHours);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? tApi(err.message) : t("my.loadFail")))
      .finally(() => setLoading(false));
  }, [authLoading, user, t, tApi]);

  const now = Date.now();
  const upcoming = useMemo(
    () =>
      bookings
        .filter((booking) => isOpenVisit(booking) && new Date(booking.start).getTime() >= now)
        .sort(byStartAsc),
    [bookings, now],
  );
  const history = useMemo(
    () =>
      bookings
        .filter((booking) => !isOpenVisit(booking) || new Date(booking.start).getTime() < now)
        .sort(byStartDesc),
    [bookings, now],
  );
  const next = upcoming[0] ?? null;
  const visible = tab === "upcoming" ? upcoming.slice(1) : history;
  const hoursLabel = cancellationHours === 1 ? t("hours.one") : t("hours.many", { n: cancellationHours });

  async function onCancel(id: number) {
    if (pendingId !== id) {
      setPendingId(id);
      return;
    }
    setWorkingId(id);
    setError("");
    try {
      const updated = await cancelBooking(id);
      setBookings((current) => current.map((booking) => (booking.id === id ? updated : booking)));
      setPendingId(null);
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("my.cancelFail"));
    } finally {
      setWorkingId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <main className="auth-page">
        <p>{t("loadingBookings")}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">{t("my.account")}</p>
          <h1>{t("my.signInTitle")}</h1>
          <p className="lede">{t("my.signInLede")}</p>
          <div className="auth-form">
            <Link className="btn btn-gold" to="/login" state={{ from: "/bookings" }}>
              {t("auth.signIn")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bookings-shell">
      <header className="admin-hero">
        <p className="eyebrow">{t("my.eyebrow")}</p>
        <h1>{t("my.title")}</h1>
        <p className="lede">{t("my.lede", { hours: hoursLabel })}</p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!bookings.length ? (
        <section className="auth-card">
          <p className="lede">{t("my.empty")}</p>
          <div className="auth-form">
            <Link className="btn btn-gold" to="/book">
              {t("my.bookCta")}
            </Link>
          </div>
        </section>
      ) : (
        <>
          {next ? (
            <NextVisitCard
              booking={next}
              hoursLabel={hoursLabel}
              pendingId={pendingId}
              workingId={workingId}
              onCancel={onCancel}
            />
          ) : null}

          <div className="board-tabs" role="tablist">
            <button className={tab === "upcoming" ? "tab active" : "tab"} type="button" onClick={() => setTab("upcoming")}>
              {t("my.upcoming")}
              <span className="count-badge">{upcoming.length}</span>
            </button>
            <button className={tab === "history" ? "tab active" : "tab"} type="button" onClick={() => setTab("history")}>
              {t("my.history")}
            </button>
          </div>

          {!visible.length && !(tab === "upcoming" && next) ? (
            <p className="lede">{tab === "upcoming" ? t("my.noUpcoming") : t("my.noHistory")}</p>
          ) : visible.length ? (
            <ul className="booking-list">
              {visible.map((booking) => (
                <li key={booking.id} className="booking-card">
                  <div>
                    <p className="booking-when">
                      {formatIsoDateLong(booking.localDate, intl)} · {booking.localTime}
                    </p>
                    <p className="booking-service">{t("my.with", { service: booking.serviceName, barber: booking.barberName })}</p>
                    <p className="booking-meta">{t("my.meta", { price: formatPrice(booking.priceIls), n: booking.durationMinutes })}</p>
                    {booking.note ? (
                      <details className="booking-note">
                        <summary>{t("note")}</summary>
                        <p>{booking.note}</p>
                      </details>
                    ) : null}
                    {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
                      <p className="salon-cancel-note">{t("my.cancelSalon", { reason: booking.cancelledReason })}</p>
                    ) : null}
                  </div>
                  <div className="booking-side">
                    <span className={`status-pill status-${booking.status.toLowerCase()}`}>{t(statusKey(booking.status))}</span>
                    {booking.cancellable ? (
                      <>
                        <button
                          className="btn btn-ghost btn-compact btn-danger"
                          type="button"
                          disabled={workingId === booking.id}
                          onClick={() => onCancel(booking.id)}
                        >
                          {workingId === booking.id
                            ? t("my.cancelling")
                            : pendingId === booking.id
                              ? t("my.confirmCancel")
                              : t("my.cancel")}
                        </button>
                        <p className="cancel-hint">
                          {booking.status === "Pending" ? t("my.withdrawHint") : t("my.noticeHint", { hours: hoursLabel })}
                        </p>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </main>
  );
}

function NextVisitCard({
  booking,
  hoursLabel,
  pendingId,
  workingId,
  onCancel,
}: {
  booking: PublicBooking;
  hoursLabel: string;
  pendingId: number | null;
  workingId: number | null;
  onCancel: (id: number) => void;
}) {
  const { t, intl } = useLocale();
  return (
    <section className="next-visit-card">
      <p className="eyebrow">{t("my.next")}</p>
      <p className="next-visit-day">{formatIsoDateLong(booking.localDate, intl)}</p>
      <p className="next-visit-time">{booking.localTime}</p>
      <p className="next-visit-detail">{t("my.with", { service: booking.serviceName, barber: booking.barberName })}</p>
      <p className="next-visit-price">{formatPrice(booking.priceIls)}</p>
      <span className={`status-pill status-${booking.status.toLowerCase()}`}>{t(statusKey(booking.status))}</span>
      {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
        <p className="salon-cancel-note">{t("my.cancelSalon", { reason: booking.cancelledReason })}</p>
      ) : null}
      {booking.cancellable ? (
        <div className="next-visit-actions">
          <button
            className="btn btn-ghost btn-danger"
            type="button"
            disabled={workingId === booking.id}
            onClick={() => onCancel(booking.id)}
          >
            {workingId === booking.id ? t("my.cancelling") : pendingId === booking.id ? t("my.confirmCancel") : t("my.cancelVisit")}
          </button>
          <p className="cancel-hint">
            {booking.status === "Pending" ? t("my.withdrawHint") : t("my.noticeHint", { hours: hoursLabel })}
          </p>
        </div>
      ) : null}
    </section>
  );
}
