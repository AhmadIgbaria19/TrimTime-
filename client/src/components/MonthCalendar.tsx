import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  addIsoDays,
  daysInMonth,
  formatIsoDateLong,
  isoWeekdaySun0,
  monthLabel,
  monthOverlapsWindow,
  parseIsoDate,
  shiftMonth,
  toIso,
  weekdaySun0,
  zonedToday,
} from "../lib/dates";
import { useLocale } from "../context/LocaleContext";
import { weekdayKey } from "../i18n/messages";

type MonthCalendarProps = {
  timeZone: string;
  horizonDays: number;
  openWeekdays: number[];
  blockedDates: string[];
  value: string;
  onChange: (date: string) => void;
};

export function MonthCalendar({
  timeZone,
  horizonDays,
  openWeekdays,
  blockedDates,
  value,
  onChange,
}: MonthCalendarProps) {
  const { t, dir, intl } = useLocale();
  const today = zonedToday(timeZone);
  const last = addIsoDays(today, horizonDays);

  const initial = parseIsoDate(value && value >= today && value <= last ? value : today);
  const open = useMemo(() => new Set(openWeekdays), [openWeekdays]);
  const blocked = useMemo(() => new Set(blockedDates), [blockedDates]);

  function isOpenDay(iso: string) {
    return open.has(isoWeekdaySun0(iso)) && !blocked.has(iso);
  }

  function isSelectable(iso: string) {
    return iso >= today && iso <= last && isOpenDay(iso);
  }
  const pendingFocus = useRef<string | null>(null);
  const [view, setView] = useState({ year: initial.year, month: initial.month });

  useEffect(() => {
    if (!value) {
      const now = parseIsoDate(today);
      setView({ year: now.year, month: now.month });
      return;
    }
    if (value < today || value > last) {
      return;
    }
    const selected = parseIsoDate(value);
    setView({ year: selected.year, month: selected.month });
  }, [value, today, last]);

  const cells = useMemo(() => {
    const firstWeekday = weekdaySun0(view.year, view.month, 1);
    const count = daysInMonth(view.year, view.month);
    const leading = Array.from({ length: firstWeekday }, () => null);
    const days = Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      const iso = toIso(view.year, view.month, day);
      return {
        day,
        iso,
        disabled: !isSelectable(iso),
        closed: !isOpenDay(iso),
        today: iso === today,
        selected: iso === value,
      };
    });
    return [...leading, ...days];
  }, [view, today, last, value, openWeekdays, blockedDates]);

  useEffect(() => {
    if (!pendingFocus.current) {
      return;
    }
    const node = document.getElementById(`cal-day-${pendingFocus.current}`);
    pendingFocus.current = null;
    node?.focus();
  }, [cells]);

  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  const canPrev = monthOverlapsWindow(prev.year, prev.month, today, last);
  const canNext = monthOverlapsWindow(next.year, next.month, today, last);
  const label = monthLabel(view.year, view.month, intl);
  const tabStop =
    cells.find((cell) => cell?.selected)?.iso ??
    cells.find((cell) => cell && !cell.disabled && cell.today)?.iso ??
    cells.find((cell) => cell && !cell.disabled)?.iso;

  function moveFocus(currentIso: string, delta: number) {
    let iso = currentIso;
    for (let step = 0; step < 42; step += 1) {
      const { year, month, day } = parseIsoDate(iso);
      const utc = new Date(Date.UTC(year, month - 1, day + delta));
      iso = toIso(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
      if (iso < today || iso > last) {
        return;
      }
      if (!isSelectable(iso)) {
        continue;
      }
      const nextDay = parseIsoDate(iso);
      pendingFocus.current = iso;
      setView({ year: nextDay.year, month: nextDay.month });
      if (nextDay.year === view.year && nextDay.month === view.month) {
        pendingFocus.current = null;
        document.getElementById(`cal-day-${iso}`)?.focus();
      }
      return;
    }
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, iso: string) {
    const keys: Record<string, number> = {
      ArrowLeft: dir === "rtl" ? 1 : -1,
      ArrowRight: dir === "rtl" ? -1 : 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key === "Home") {
      event.preventDefault();
      const { year, month, day } = parseIsoDate(iso);
      moveFocus(iso, -weekdaySun0(year, month, day));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const { year, month, day } = parseIsoDate(iso);
      moveFocus(iso, 6 - weekdaySun0(year, month, day));
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      if (canPrev) {
        setView(prev);
      }
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      if (canNext) {
        setView(next);
      }
      return;
    }
    const delta = keys[event.key];
    if (delta) {
      event.preventDefault();
      moveFocus(iso, delta);
    }
  }

  return (
    <div className="month-calendar">
      <div className="cal-toolbar">
        <button
          className="cal-nav"
          type="button"
          aria-label={t("cal.prevMonth")}
          disabled={!canPrev}
          onClick={() => setView(prev)}
        >
          ‹
        </button>
        <p className="cal-month" aria-live="polite">
          {label}
        </p>
        <button
          className="cal-nav"
          type="button"
          aria-label={t("cal.nextMonth")}
          disabled={!canNext}
          onClick={() => setView(next)}
        >
          ›
        </button>
      </div>

      <div role="grid" aria-label={label} className="cal-grid">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} role="columnheader" className="cal-weekday" aria-label={t(weekdayKey(index))}>
            {t(weekdayKey(index, true))}
          </div>
        ))}
        {cells.map((cell, index) =>
          cell ? (
            <button
              key={cell.iso}
              id={`cal-day-${cell.iso}`}
              className={[
                "cal-day",
                cell.today ? "is-today" : "",
                cell.selected ? "is-selected" : "",
                cell.closed ? "is-closed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              role="gridcell"
              tabIndex={cell.iso === tabStop ? 0 : -1}
              disabled={cell.disabled}
              aria-disabled={cell.disabled}
              aria-selected={cell.selected}
              aria-current={cell.today ? "date" : undefined}
              aria-label={`${formatIsoDateLong(cell.iso, intl)}${cell.closed ? t("cal.closedSuffix") : ""}`}
              onClick={() => onChange(cell.iso)}
              onKeyDown={(event) => onDayKeyDown(event, cell.iso)}
            >
              {cell.day}
            </button>
          ) : (
            <div key={`pad-${index}`} className="cal-pad" role="presentation" />
          ),
        )}
      </div>

      <p className="cal-selected">
        {value && isSelectable(value) ? formatIsoDateLong(value, intl) : t("cal.selectDay")}
      </p>
    </div>
  );
}
