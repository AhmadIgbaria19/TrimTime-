import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminBookings,
  runAdminBookingAction,
  type AdminBooking,
  type AdminBookingAction,
} from "../api/auth";
import { formatPrice, type Catalog } from "../api/catalog";
import { DeskCalendar } from "../components/DeskCalendar";
import { addIsoDays, formatIsoDateLong, formatZonedClock, zonedToday } from "../lib/dates";
import { AdminManualBooking } from "./AdminManualBooking";

const ACTION_LABELS: Record<AdminBookingAction, string> = {
  confirm: "Confirm",
  reject: "Reject",
  complete: "Complete",
  "no-show": "No-show",
  cancel: "Cancel",
};

const CONFIRM_COPY: Record<AdminBookingAction, string> = {
  confirm: "Confirm this request and hold the time?",
  reject: "Reject this request and free the time?",
  complete: "Mark this visit as completed?",
  "no-show": "Mark this customer as a no-show?",
  cancel: "Cancel this confirmed visit? The customer will see your reason. There is no customer notice window.",
};

const SCHEDULE_STATUSES = ["Confirmed", "Completed", "Cancelled", "Rejected", "NoShow", "Expired"] as const;
const REFRESH_MS = 30000;

type ViewTab = "schedule" | "pending";

function isViewTab(value: string | null): value is ViewTab {
  return value === "schedule" || value === "pending";
}

function isStatusFilter(value: string | null): value is string {
  return value === "all" || (value !== null && (SCHEDULE_STATUSES as readonly string[]).includes(value));
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function byStart(a: AdminBooking, b: AdminBooking) {
  return new Date(a.start).getTime() - new Date(b.start).getTime() || a.id - b.id;
}

function matchesSearch(booking: AdminBooking, query: string) {
  if (!query) {
    return true;
  }
  const haystack = `${booking.customerName} ${booking.customerPhone}`.toLowerCase();
  return haystack.includes(query);
}

function nextAppointmentIds(rows: AdminBooking[], nowMs: number, barberId: string) {
  const upcoming = rows
    .filter((booking) => booking.status === "Confirmed" && new Date(booking.start).getTime() >= nowMs)
    .sort(byStart);
  if (barberId) {
    const next = upcoming.find((booking) => String(booking.barberId) === barberId);
    return next ? new Set([next.id]) : new Set<number>();
  }
  const seen = new Set<number>();
  const ids = new Set<number>();
  for (const booking of upcoming) {
    if (seen.has(booking.barberId)) {
      continue;
    }
    seen.add(booking.barberId);
    ids.add(booking.id);
  }
  return ids;
}

function ActionButtons({
  booking,
  workingId,
  onAction,
}: {
  booking: AdminBooking;
  workingId: number | null;
  onAction: (id: number, action: AdminBookingAction) => void;
}) {
  if (!booking.actions.length) {
    return <span className="muted-dash">—</span>;
  }
  return (
    <div className="admin-actions">
      {booking.actions.map((item) => {
        const danger = item.action === "reject" || item.action === "no-show" || item.action === "cancel";
        return (
          <button
            key={item.action}
            className={`desk-action ${danger ? "is-danger" : "is-primary"}`}
            type="button"
            disabled={workingId !== null || !item.enabled}
            title={item.reason}
            onClick={() => onAction(booking.id, item.action)}
          >
            {ACTION_LABELS[item.action]}
          </button>
        );
      })}
    </div>
  );
}

function BookingNote({ note }: { note: string }) {
  if (!note) {
    return null;
  }
  return (
    <details className="booking-note">
      <summary>Note</summary>
      <p dir="auto">{note}</p>
    </details>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a className="phone-link" href={`tel:${phone}`}>
      {phone}
    </a>
  );
}

function TimeRange({ booking, showDate }: { booking: AdminBooking; showDate?: boolean }) {
  const end = booking.localEndTime;
  return (
    <div className="desk-time">
      <strong>
        {booking.localTime}
        {end ? `–${end}` : ""}
      </strong>
      {showDate ? <span className="cell-sub">{formatIsoDateLong(booking.localDate)}</span> : null}
    </div>
  );
}

export function AdminBookingsPanel({ catalog }: { catalog: Catalog }) {
  const timeZone = catalog.salon.timezone || "Asia/Jerusalem";
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{ id: number; action: AdminBookingAction } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [tab, setTab] = useState<ViewTab>(() => {
    const raw = searchParams.get("tab");
    return isViewTab(raw) ? raw : "schedule";
  });
  const [date, setDate] = useState(() => {
    const raw = searchParams.get("date");
    return isIsoDate(raw) ? raw : zonedToday(timeZone);
  });
  const [barberId, setBarberId] = useState("");
  const [status, setStatus] = useState(() => {
    const raw = searchParams.get("status");
    return isStatusFilter(raw) ? raw : "Confirmed";
  });
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [jumpTo, setJumpTo] = useState<AdminBooking | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const today = zonedToday(timeZone);
  const workingRef = useRef<number | null>(null);
  const drawerRef = useRef(false);
  const pendingRef = useRef(false);

  workingRef.current = workingId;
  drawerRef.current = drawerOpen;
  pendingRef.current = pendingAction !== null;

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (isViewTab(nextTab)) {
      setTab(nextTab);
    }
    const nextStatus = searchParams.get("status");
    if (isStatusFilter(nextStatus)) {
      setStatus(nextStatus);
    }
    const nextDate = searchParams.get("date");
    if (isIsoDate(nextDate)) {
      setDate(nextDate);
    }
  }, [searchParams]);

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
      setError(err instanceof Error ? err.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (workingRef.current || drawerRef.current || pendingRef.current) {
        return;
      }
      reload(true).catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  function requestAction(id: number, action: AdminBookingAction) {
    if (workingId !== null) {
      return;
    }
    setCancelReason("");
    setPendingAction({ id, action });
  }

  async function confirmAction() {
    if (!pendingAction || workingId !== null) {
      return;
    }
    const { id, action } = pendingAction;
    if (action === "cancel" && (cancelReason.trim().length < 2 || cancelReason.trim().length > 280)) {
      setError("Enter a cancellation reason (2–280 characters) for the customer.");
      return;
    }
    setPendingAction(null);
    setWorkingId(id);
    setError("");
    setSuccess("");
    try {
      const updated = await runAdminBookingAction(id, action, action === "cancel" ? { reason: cancelReason.trim() } : undefined);
      setBookings((current) => current.map((booking) => (booking.id === id ? updated : booking)));
      setSuccess(`${updated.customerName} is now ${updated.status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the booking.");
    } finally {
      setWorkingId(null);
      setCancelReason("");
    }
  }

  const search = query.trim().toLowerCase();
  const pendingAll = useMemo(
    () => bookings.filter((booking) => booking.status === "Pending").sort(byStart),
    [bookings],
  );
  const pendingCount = pendingAll.length;
  const filteredPending = pendingAll.filter(
    (booking) => (!barberId || String(booking.barberId) === barberId) && matchesSearch(booking, search),
  );

  const scheduleRows = useMemo(() => {
    return bookings
      .filter((booking) => booking.localDate === date && booking.status !== "Pending")
      .filter((booking) => !barberId || String(booking.barberId) === barberId)
      .filter((booking) => status === "all" || booking.status === status)
      .filter((booking) => matchesSearch(booking, search))
      .sort(byStart);
  }, [bookings, date, barberId, status, search]);

  const nextIds = useMemo(
    () => nextAppointmentIds(scheduleRows, Date.now(), barberId),
    [scheduleRows, barberId],
  );

  const visible = tab === "pending" ? filteredPending : scheduleRows;
  const dateLabel = date === today ? `Today · ${formatIsoDateLong(date)}` : formatIsoDateLong(date);

  function emptyCopy() {
    if (tab === "pending") {
      return pendingCount
        ? "No pending requests match these filters. The count above is every waiting request, any day."
        : "No pending requests right now. This count covers every day, not only the selected date.";
    }
    if (status === "Confirmed") {
      return "No confirmed visits on this day. Use status to see completed or cancelled bookings.";
    }
    return "No bookings in this view.";
  }

  return (
    <div className="desk-shell">
      <header className="desk-top">
        <div>
          <p className="eyebrow">Salon desk</p>
          <h1>Manage bookings</h1>
          <p className="desk-date-label">{dateLabel}</p>
        </div>
        <button className="desk-add-btn" type="button" onClick={() => setDrawerOpen(true)}>
          + Add Booking
        </button>
      </header>

      <div className="desk-layout">
        <aside className="desk-side">
          <div className="desk-day-nav">
            <button className="desk-btn desk-btn-solid" type="button" onClick={() => setDate(addIsoDays(date, -1))}>
              Previous
            </button>
            <button
              className={date === today ? "desk-btn desk-btn-gold" : "desk-btn desk-btn-solid"}
              type="button"
              onClick={() => setDate(today)}
            >
              Today
            </button>
            <button className="desk-btn desk-btn-solid" type="button" onClick={() => setDate(addIsoDays(date, 1))}>
              Next
            </button>
          </div>
          <DeskCalendar value={date} today={today} onChange={setDate} />
          <p className="desk-updated">
            {updatedAt ? `Updated ${formatZonedClock(timeZone, updatedAt)}` : "Waiting for first load"}
          </p>
        </aside>

        <section className="desk-main">
          <div className="desk-tabs" role="tablist">
            <button
              className={tab === "schedule" ? "desk-tab is-active" : "desk-tab"}
              type="button"
              onClick={() => setTab("schedule")}
            >
              Day Schedule
            </button>
            <button
              className={tab === "pending" ? "desk-tab is-active" : "desk-tab"}
              type="button"
              onClick={() => setTab("pending")}
            >
              Pending Requests
              <span className="count-badge">{pendingCount}</span>
            </button>
          </div>
          <p className="desk-scope">
            {tab === "pending"
              ? "Pending count is every waiting request, any day — not only the selected date."
              : "Day schedule shows the selected date. Confirmed visits are the default working list."}
          </p>

          <div className="desk-filters">
            <label>
              Barber
              <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
                <option value="">All barbers</option>
                {catalog.barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.name}
                  </option>
                ))}
              </select>
            </label>
            {tab === "schedule" ? (
              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="Confirmed">Confirmed</option>
                  <option value="all">All except pending</option>
                  {SCHEDULE_STATUSES.filter((value) => value !== "Confirmed").map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="desk-search">
              Search
              <input
                type="search"
                value={query}
                placeholder="Name or phone"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {success ? <p className="desk-success">{success}</p> : null}
          {jumpTo ? (
            <p className="desk-success">
              Added {jumpTo.customerName} on {formatIsoDateLong(jumpTo.localDate)} at {jumpTo.localTime}.{" "}
              <button
                className="text-btn"
                type="button"
                onClick={() => {
                  setDate(jumpTo.localDate);
                  setTab("schedule");
                  setStatus("Confirmed");
                  setJumpTo(null);
                }}
              >
                View booking
              </button>
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}

          {loading ? <p className="lede">Loading the day’s board…</p> : null}
          {!loading && !visible.length ? <p className="lede">{emptyCopy()}</p> : null}

          {!loading && visible.length ? (
            <>
              <div className="schedule-table-wrap">
                <table className="schedule-table desk-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Service</th>
                      <th>Barber</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((booking) => {
                      const isNext = tab === "schedule" && nextIds.has(booking.id);
                      const isConfirmed = booking.status === "Confirmed";
                      return (
                        <tr
                          key={booking.id}
                          className={[isNext ? "is-next" : "", isConfirmed ? "is-confirmed" : ""]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <td>
                            <TimeRange booking={booking} showDate={tab === "pending"} />
                            {isNext ? <span className="next-flag">Next appointment</span> : null}
                          </td>
                          <td>
                            <strong className="desk-customer" dir="auto">
                              {booking.customerName}
                            </strong>
                            {booking.isGuest ? <span className="visitor-tag">Visitor · no account</span> : null}
                            {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
                              <span className="visitor-tag">Salon cancel: {booking.cancelledReason}</span>
                            ) : null}
                            <BookingNote note={booking.note} />
                          </td>
                          <td>
                            <PhoneLink phone={booking.customerPhone} />
                          </td>
                          <td>
                            {booking.serviceName}
                            <span className="cell-sub">{formatPrice(booking.priceIls)}</span>
                          </td>
                          <td>{booking.barberName}</td>
                          <td>
                            <span className={`status-pill status-${booking.status.toLowerCase()}`}>
                              {booking.status}
                            </span>
                          </td>
                          <td>
                            <ActionButtons booking={booking} workingId={workingId} onAction={requestAction} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="booking-list schedule-cards">
                {visible.map((booking) => {
                  const isNext = tab === "schedule" && nextIds.has(booking.id);
                  return (
                    <li
                      key={booking.id}
                      className={`booking-card ${isNext ? "is-next" : ""} ${booking.status === "Confirmed" ? "is-confirmed" : ""}`}
                    >
                      <div>
                        <TimeRange booking={booking} showDate={tab === "pending"} />
                        {isNext ? <p className="next-flag">Next appointment</p> : null}
                        <p className="desk-customer" dir="auto">
                          {booking.customerName}
                        </p>
                        {booking.isGuest ? <p className="visitor-tag">Visitor · no account</p> : null}
                        {booking.status === "Cancelled" && booking.cancelledBy === "admin" && booking.cancelledReason ? (
                          <p className="visitor-tag">Salon cancel: {booking.cancelledReason}</p>
                        ) : null}
                        <p className="booking-meta">
                          <PhoneLink phone={booking.customerPhone} />
                        </p>
                        <p className="booking-meta">
                          {booking.serviceName} · {booking.barberName} · {formatPrice(booking.priceIls)}
                        </p>
                        <BookingNote note={booking.note} />
                      </div>
                      <div className="booking-side">
                        <span className={`status-pill status-${booking.status.toLowerCase()}`}>{booking.status}</span>
                        <ActionButtons booking={booking} workingId={workingId} onAction={requestAction} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <AdminManualBooking
        catalog={catalog}
        open={drawerOpen}
        initialDate={date}
        onClose={() => setDrawerOpen(false)}
        onCreated={(booking) => {
          setBookings((current) => [booking, ...current.filter((item) => item.id !== booking.id)]);
          setDrawerOpen(false);
          setSuccess("");
          if (booking.localDate !== date) {
            setJumpTo(booking);
          } else {
            setJumpTo(null);
            setTab("schedule");
            setStatus("Confirmed");
            setSuccess(`Added ${booking.customerName} at ${booking.localTime}.`);
          }
        }}
      />

      {pendingAction ? (
        <div className="desk-drawer-overlay" onClick={() => workingId === null && setPendingAction(null)}>
          <div
            className="desk-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-action-title">Please confirm</h2>
            <p className="lede">{CONFIRM_COPY[pendingAction.action]}</p>
            {pendingAction.action === "cancel" ? (
              <label>
                Reason for the customer
                <textarea
                  value={cancelReason}
                  maxLength={280}
                  rows={3}
                  dir="auto"
                  placeholder="Why the salon is cancelling this visit"
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </label>
            ) : null}
            <div className="desk-day-nav">
              <button className="desk-btn desk-btn-solid" type="button" onClick={() => setPendingAction(null)}>
                Back
              </button>
              <button
                className="desk-btn desk-btn-gold"
                type="button"
                disabled={pendingAction.action === "cancel" && cancelReason.trim().length < 2}
                onClick={confirmAction}
              >
                {ACTION_LABELS[pendingAction.action]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
