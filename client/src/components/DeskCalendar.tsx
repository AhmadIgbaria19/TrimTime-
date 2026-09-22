import { useEffect, useMemo, useState } from "react";
import {
  daysInMonth,
  formatIsoDateLong,
  monthLabel,
  parseIsoDate,
  shiftMonth,
  toIso,
  weekdaySun0,
} from "../lib/dates";
import { useLocale } from "../context/LocaleContext";
import { weekdayKey } from "../i18n/messages";

export function DeskCalendar({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const { t, intl } = useLocale();
  const selected = parseIsoDate(value || today);
  const [view, setView] = useState({ year: selected.year, month: selected.month });

  useEffect(() => {
    const next = parseIsoDate(value || today);
    setView({ year: next.year, month: next.month });
  }, [value, today]);

  const cells = useMemo(() => {
    const leading = weekdaySun0(view.year, view.month, 1);
    const count = daysInMonth(view.year, view.month);
    const pads = Array.from({ length: leading }, () => null);
    const days = Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      const iso = toIso(view.year, view.month, day);
      return { day, iso, today: iso === today, selected: iso === value };
    });
    return [...pads, ...days];
  }, [view, today, value]);

  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);

  return (
    <div className="desk-calendar">
      <div className="desk-cal-toolbar">
        <button className="desk-cal-nav" type="button" aria-label={t("cal.prevMonth")} onClick={() => setView(prev)}>
          ‹
        </button>
        <p className="desk-cal-month">{monthLabel(view.year, view.month, intl)}</p>
        <button className="desk-cal-nav" type="button" aria-label={t("cal.nextMonth")} onClick={() => setView(next)}>
          ›
        </button>
      </div>
      <div className="desk-cal-grid" role="grid" aria-label={t("cal.chooseDay")}>
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="desk-cal-weekday">
            {t(weekdayKey(index, true))}
          </div>
        ))}
        {cells.map((cell, index) =>
          cell ? (
            <button
              key={cell.iso}
              className={[
                "desk-cal-day",
                cell.today ? "is-today" : "",
                cell.selected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              aria-label={formatIsoDateLong(cell.iso, intl)}
              aria-current={cell.today ? "date" : undefined}
              aria-pressed={cell.selected}
              onClick={() => onChange(cell.iso)}
            >
              {cell.day}
            </button>
          ) : (
            <span key={`pad-${index}`} className="desk-cal-pad" />
          ),
        )}
      </div>
    </div>
  );
}
