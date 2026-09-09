import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  apiRequest,
  createAdminBooking,
  fetchAdminCustomers,
  type AdminBooking,
  type AdminCustomer,
} from "../api/auth";
import { formatPrice, type Catalog } from "../api/catalog";
import { zonedToday } from "../lib/dates";

type Slot = { localTime: string; start: string | null };

type Availability = {
  date: string;
  slots: Slot[];
};

type PartyKind = "guest" | "account";

export function AdminManualBooking({
  catalog,
  open,
  initialDate,
  onClose,
  onCreated,
}: {
  catalog: Catalog;
  open: boolean;
  initialDate: string;
  onClose: () => void;
  onCreated: (booking: AdminBooking) => void;
}) {
  const [party, setParty] = useState<PartyKind>("guest");
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState("");
  const [note, setNote] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const panelRef = useRef<HTMLDivElement>(null);

  const services = catalog.services.filter((service) => service.active);
  const selectedService = services.find((service) => String(service.id) === serviceId);
  const barbers = useMemo(() => {
    const id = Number(serviceId);
    return catalog.barbers.filter((barber) => barber.active && (!id || barber.serviceIds.includes(id)));
  }, [catalog.barbers, serviceId]);
  const partyReady = party === "guest" ? guestName.trim().length >= 2 && guestPhone.trim().length > 0 : Boolean(customerId);

  useEffect(() => {
    if (!open) {
      return;
    }
    setParty("guest");
    setDate(initialDate || zonedToday(catalog.salon.timezone || "Asia/Jerusalem"));
    setQuery("");
    setCustomerId("");
    setGuestName("");
    setGuestPhone("");
    setServiceId("");
    setBarberId("");
    setSelectedTime("");
    setNote("");
    setSlots([]);
    setError("");
    setSubmitting(false);
    idempotencyKey.current = crypto.randomUUID();
  }, [open, initialDate, catalog.salon.timezone]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open || party !== "account") {
      return;
    }
    setLoadingCustomers(true);
    fetchAdminCustomers(query)
      .then((data) => setCustomers(data.customers))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load customers."))
      .finally(() => setLoadingCustomers(false));
  }, [open, party, query]);

  useEffect(() => {
    if (barberId && !barbers.some((barber) => String(barber.id) === barberId)) {
      setBarberId("");
    }
  }, [barberId, barbers]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedTime("");
    setSlots([]);
    if (!serviceId || !barberId || !date) {
      return;
    }
    const controller = new AbortController();
    setLoadingSlots(true);
    apiRequest<Availability>(
      `/api/availability?${new URLSearchParams({ serviceId, barberId, date }).toString()}`,
      { signal: controller.signal },
    )
      .then((data) => setSlots(data.slots))
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load times.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSlots(false);
        }
      });
    return () => controller.abort();
  }, [open, serviceId, barberId, date]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const slot = slots.find((item) => item.localTime === selectedTime);
    if (!partyReady || !slot?.start) {
      setError(
        party === "guest"
          ? "Enter the visitor’s name and phone, then choose an available time."
          : "Choose a customer and an available time.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const booking = await createAdminBooking({
        customerId: party === "account" ? Number(customerId) : null,
        guestName: party === "guest" ? guestName : undefined,
        guestPhone: party === "guest" ? guestPhone : undefined,
        serviceId: Number(serviceId),
        barberId: Number(barberId),
        start: slot.start,
        note,
        idempotencyKey: idempotencyKey.current,
      });
      onCreated(booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the booking.");
      setSubmitting(false);
      idempotencyKey.current = crypto.randomUUID();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="desk-drawer-overlay"
      onClick={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <div
        className="desk-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-booking-title"
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="desk-drawer-head">
          <div>
            <p className="eyebrow">Salon desk</p>
            <h2 id="add-booking-title">Add booking</h2>
          </div>
          <button className="desk-btn desk-btn-solid" type="button" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </div>
        <p className="form-hint">
          A visitor booking is stored on the appointment only. It does not create a login, and the phone
          number is not linked to an existing account.
        </p>
        <form className="walk-in-form" onSubmit={onSubmit}>
          <div>
            <p className="form-hint">Who is this visit for?</p>
            <div className="party-toggle" role="group" aria-label="Booking party">
              <button
                className={party === "guest" ? "is-active" : ""}
                type="button"
                onClick={() => setParty("guest")}
              >
                Visitor · no account
              </button>
              <button
                className={party === "account" ? "is-active" : ""}
                type="button"
                onClick={() => setParty("account")}
              >
                Existing customer
              </button>
            </div>
          </div>
          {party === "guest" ? (
            <>
              <label>
                Visitor name
                <input
                  value={guestName}
                  minLength={2}
                  maxLength={80}
                  required
                  dir="auto"
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>
              <label>
                Phone
                <input
                  value={guestPhone}
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05… or +972"
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Find customer
                <input
                  type="search"
                  value={query}
                  placeholder="Name or phone"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                Customer
                <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
                  <option value="">{loadingCustomers ? "Loading customers…" : "Select a customer"}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Service
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMinutes} min · {formatPrice(service.priceIls)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Barber
            <select value={barberId} onChange={(event) => setBarberId(event.target.value)} required>
              <option value="">Select a barber</option>
              {barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <fieldset className="walk-in-slots">
            <legend>Available time</legend>
            {loadingSlots ? <p className="form-hint">Checking times…</p> : null}
            {!loadingSlots && serviceId && barberId && date && !slots.length ? (
              <p className="form-hint">No times on this day.</p>
            ) : null}
            {slots.length ? (
              <ul className="slot-grid">
                {slots.map((slot) => (
                  <li key={slot.localTime}>
                    <button
                      className={selectedTime === slot.localTime ? "slot-btn is-selected" : "slot-btn"}
                      type="button"
                      onClick={() => setSelectedTime(slot.localTime)}
                    >
                      {slot.localTime}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>
          <label>
            Note (optional)
            <textarea
              value={note}
              maxLength={280}
              rows={3}
              dir="auto"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-gold" type="submit" disabled={submitting || !selectedTime || !partyReady}>
            {submitting ? "Adding…" : "Add confirmed visit"}
          </button>
          {selectedService && selectedTime ? (
            <p className="form-hint">
              {selectedService.name} at {selectedTime} will be Confirmed
              {party === "guest" ? " for this visitor." : " for the selected customer."}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
