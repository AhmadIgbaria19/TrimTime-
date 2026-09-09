import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cancelBooking, fetchMyBookings, type PublicBooking } from "../api/auth";
import { formatPrice } from "../api/catalog";
import { useAuth } from "../context/AuthContext";
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
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load bookings."))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

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
  const hoursLabel = cancellationHours === 1 ? "1 hour" : `${cancellationHours} hours`;

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
      setError(err instanceof Error ? err.message : "Could not cancel this booking.");
    } finally {
      setWorkingId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <main className="auth-page">
        <p>Loading your bookings…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">Account</p>
          <h1>Sign in to see bookings</h1>
          <p className="lede">Your appointments are saved to the name and phone on your account.</p>
          <div className="auth-form">
            <Link className="btn btn-gold" to="/login" state={{ from: "/bookings" }}>
              Sign in
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="bookings-shell">
      <header className="admin-hero">
        <p className="eyebrow">Your visits</p>
        <h1>My Bookings</h1>
        <p className="lede">
          Pending requests hold the time until the salon responds. Confirmed visits need at least {hoursLabel}{" "}
          of notice to cancel.
        </p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!bookings.length ? (
        <section className="auth-card">
          <p className="lede">No bookings yet.</p>
          <div className="auth-form">
            <Link className="btn btn-gold" to="/book">
              Book an appointment
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
              Upcoming
              <span className="count-badge">{upcoming.length}</span>
            </button>
            <button className={tab === "history" ? "tab active" : "tab"} type="button" onClick={() => setTab("history")}>
              History
            </button>
          </div>

          {!visible.length && !(tab === "upcoming" && next) ? (
            <p className="lede">{tab === "upcoming" ? "No upcoming visits." : "No past visits yet."}</p>
          ) : visible.length ? (
            <ul className="booking-list">
              {visible.map((booking) => (
                <li key={booking.id} className="booking-card">
                  <div>
                    <p className="booking-when">
                      {formatIsoDateLong(booking.localDate)} · {booking.localTime}
                    </p>
                    <p className="booking-service">
                      {booking.serviceName} with {booking.barberName}
                    </p>
                    <p className="booking-meta">
                      {formatPrice(booking.priceIls)} · {booking.durationMinutes} min
                    </p>
                    {booking.note ? (
                      <details className="booking-note">
                        <summary>Note</summary>
                        <p>{booking.note}</p>
                      </details>
                    ) : null}
                    {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
                      <p className="salon-cancel-note">Cancelled by the salon: {booking.cancelledReason}</p>
                    ) : null}
                  </div>
                  <div className="booking-side">
                    <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
                    {booking.cancellable ? (
                      <>
                        <button
                          className="btn btn-ghost btn-compact btn-danger"
                          type="button"
                          disabled={workingId === booking.id}
                          onClick={() => onCancel(booking.id)}
                        >
                          {workingId === booking.id
                            ? "Cancelling…"
                            : pendingId === booking.id
                              ? "Confirm cancel"
                              : "Cancel"}
                        </button>
                        <p className="cancel-hint">
                          {booking.status === "Pending"
                            ? "You can withdraw this request until it starts."
                            : `Confirmed visits need at least ${hoursLabel} of notice.`}
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
  return (
    <section className="next-visit-card">
      <p className="eyebrow">Next appointment</p>
      <p className="next-visit-day">{formatIsoDateLong(booking.localDate)}</p>
      <p className="next-visit-time">{booking.localTime}</p>
      <p className="next-visit-detail">
        {booking.serviceName} with {booking.barberName}
      </p>
      <p className="next-visit-price">{formatPrice(booking.priceIls)}</p>
      <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
      {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
        <p className="salon-cancel-note">Cancelled by the salon: {booking.cancelledReason}</p>
      ) : null}
      {booking.cancellable ? (
        <div className="next-visit-actions">
          <button
            className="btn btn-ghost btn-danger"
            type="button"
            disabled={workingId === booking.id}
            onClick={() => onCancel(booking.id)}
          >
            {workingId === booking.id ? "Cancelling…" : pendingId === booking.id ? "Confirm cancel" : "Cancel visit"}
          </button>
          <p className="cancel-hint">
            {booking.status === "Pending"
              ? "You can withdraw this request until it starts."
              : `Confirmed visits need at least ${hoursLabel} of notice.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}
