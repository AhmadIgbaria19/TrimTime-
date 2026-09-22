import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest, createBooking, type PublicBooking } from "../api/auth";
import { formatPrice } from "../api/catalog";
import { MonthCalendar } from "../components/MonthCalendar";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";
import { addIsoDays, datesInRange, isoWeekdaySun0, zonedToday } from "../lib/dates";
import { newIdempotencyKey } from "../lib/id";

type Slot = { localTime: string; start: string | null };

type Availability = {
  date: string;
  durationMinutes: number;
  slots: Slot[];
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function BookPage() {
  const { user } = useAuth();
  const { catalog, loading } = useSalon();
  const { t, tApi } = useLocale();
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [date, setDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<PublicBooking | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());

  const timeZone = catalog?.salon.timezone || "Asia/Jerusalem";
  const horizonDays = catalog?.salon.bookingHorizonDays ?? 30;
  const today = zonedToday(timeZone);
  const last = addIsoDays(today, horizonDays);
  const services = catalog?.services ?? [];
  const selectedService = services.find((service) => String(service.id) === serviceId);
  const barbers = useMemo(() => {
    if (!catalog) {
      return [];
    }
    const id = Number(serviceId);
    return catalog.barbers.filter((barber) => !id || barber.serviceIds.includes(id));
  }, [catalog, serviceId]);
  const openWeekdays = useMemo(
    () => (catalog?.hours ?? []).map((hour) => hour.weekday),
    [catalog],
  );

  const blockedDates = useMemo(() => {
    const dates: string[] = [];
    for (const item of catalog?.timeOff ?? []) {
      if (item.barberId !== null && (!barberId || String(item.barberId) !== barberId)) {
        continue;
      }
      dates.push(...datesInRange(item.startsOn, item.endsOn));
    }
    return dates;
  }, [catalog, barberId]);

  useEffect(() => {
    if (!date) {
      return;
    }
    if (date < today || date > last || !openWeekdays.includes(isoWeekdaySun0(date)) || blockedDates.includes(date)) {
      setDate("");
    }
  }, [date, today, last, openWeekdays, blockedDates]);

  useEffect(() => {
    if (barberId && !barbers.some((barber) => String(barber.id) === barberId)) {
      setBarberId("");
    }
  }, [barberId, barbers]);

  useEffect(() => {
    setAvailability(null);
    setSelectedTime("");
    setError("");
    setCreated(null);
    idempotencyKey.current = newIdempotencyKey();

    if (!serviceId || !barberId || !date) {
      setLoadingSlots(false);
      return;
    }

    const controller = new AbortController();
    setLoadingSlots(true);

    apiRequest<Availability>(
      `/api/availability?${new URLSearchParams({ serviceId, barberId, date }).toString()}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setAvailability(data);
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? tApi(err.message) : t("book.loadTimesFail"));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingSlots(false);
        }
      });

    return () => controller.abort();
  }, [serviceId, barberId, date]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }
    const slot = availability?.slots.find((item) => item.localTime === selectedTime);
    if (!slot?.start || !selectedService) {
      setError(t("book.chooseTimeFirst"));
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const booking = await createBooking({
        serviceId: Number(serviceId),
        barberId: Number(barberId),
        start: slot.start,
        note,
        idempotencyKey: idempotencyKey.current,
      });
      setCreated(booking);
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("book.sendFail"));
      if (!isAbortError(err)) {
        const query = new URLSearchParams({ serviceId, barberId, date });
        apiRequest<Availability>(`/api/availability?${query.toString()}`)
          .then((data) => {
            setAvailability(data);
            setSelectedTime("");
            idempotencyKey.current = newIdempotencyKey();
          })
          .catch(() => undefined);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="auth-page">
        <p>{t("loadingAtelier")}</p>
      </main>
    );
  }

  if (created) {
    return (
      <main className="auth-page">
        <section className="auth-card book-card">
          <p className="eyebrow">{t("book.received")}</p>
          <h1>{t("book.pendingTitle")}</h1>
          <p className="lede">
            {t("book.pendingLede", {
              service: created.serviceName,
              barber: created.barberName,
              date: created.localDate,
              time: created.localTime,
              price: formatPrice(created.priceIls),
              n: created.durationMinutes,
            })}
          </p>
          {created.note ? <p className="form-hint">{t("book.noteLine", { note: created.note })}</p> : null}
          <div className="auth-form">
            <Link className="btn btn-gold" to="/bookings">
              {t("book.viewMine")}
            </Link>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setCreated(null);
                setSelectedTime("");
                setNote("");
                idempotencyKey.current = newIdempotencyKey();
              }}
            >
              {t("book.another")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const canLoadTimes = Boolean(serviceId && barberId && date);
  const selectedBarber = barbers.find((barber) => String(barber.id) === barberId);

  return (
    <main className="auth-page">
      <section className="auth-card book-card">
        <p className="eyebrow">{t("book.eyebrow")}</p>
        <h1>{t("book.title")}</h1>
        <p className="lede">{t("book.lede")}</p>

        <div className="auth-form">
          <label>
            {t("service")}
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              <option value="">{t("book.selectService")}</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {t("book.serviceOption", { name: service.name, n: service.durationMinutes })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("barber")}
            <select value={barberId} onChange={(event) => setBarberId(event.target.value)}>
              <option value="">{t("book.selectBarber")}</option>
              {barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="cal-fieldset">
          <legend>{t("date")}</legend>
          <MonthCalendar
            timeZone={timeZone}
            horizonDays={horizonDays}
            openWeekdays={openWeekdays}
            blockedDates={blockedDates}
            value={date}
            onChange={setDate}
          />
        </fieldset>

        <div className="slot-board" aria-live="polite">
          <div className="slot-heading">
            <h2>{t("book.availableTimes")}</h2>
            {selectedService ? <p>{t("book.duration", { n: selectedService.durationMinutes })}</p> : null}
          </div>

          {!date ? <p className="form-hint">{t("book.selectDayHint")}</p> : null}
          {date && (!serviceId || !barberId) ? (
            <p className="form-hint">{t("book.choosePair")}</p>
          ) : null}
          {canLoadTimes && loadingSlots ? <p className="form-hint">{t("book.checkingTimes")}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {canLoadTimes && !loadingSlots && !error && availability && availability.slots.length === 0 ? (
            <p className="form-hint">{t("book.noTimes")}</p>
          ) : null}

          {canLoadTimes && !loadingSlots && availability && availability.slots.length > 0 ? (
            <ul className="slot-grid">
              {availability.slots.map((slot) => (
                <li key={slot.localTime}>
                  <button
                    className={selectedTime === slot.localTime ? "slot-btn is-selected" : "slot-btn"}
                    type="button"
                    aria-pressed={selectedTime === slot.localTime}
                    onClick={() => setSelectedTime(slot.localTime)}
                  >
                    {slot.localTime}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <form className="auth-form book-submit" onSubmit={onSubmit}>
          <label>
            {t("book.noteOptional")}
            <textarea
              value={note}
              maxLength={280}
              rows={3}
              placeholder={t("book.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {user ? (
            <button className="btn btn-gold" type="submit" disabled={!selectedTime || submitting}>
              {submitting ? t("book.sending") : t("book.requestTime")}
            </button>
          ) : (
            <p className="auth-switch">
              {t("book.signInToSend")}{" "}
              <Link to="/login" state={{ from: "/book" }}>
                {t("auth.signIn")}
              </Link>{" "}
              {t("book.or")}{" "}
              <Link to="/register" state={{ from: "/book" }}>
                {t("book.createAccountLower")}
              </Link>
              .
            </p>
          )}
        </form>

        {user && selectedTime && selectedService && selectedBarber ? (
          <p className="form-hint">
            {t("book.pendingHint", {
              service: selectedService.name,
              barber: selectedBarber.name,
              time: selectedTime,
              price: formatPrice(selectedService.priceIls),
            })}
          </p>
        ) : null}
      </section>
    </main>
  );
}
