import { WEEKDAYS } from "../api/catalog";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";
import { weekdayKey } from "../i18n/messages";

export function Hours() {
  const { catalog } = useSalon();
  const { t } = useLocale();
  const salon = catalog?.salon;
  const hours = catalog?.hours ?? [];
  const byDay = new Map(hours.map((hour) => [hour.weekday, hour]));

  return (
    <section className="section hours-section" id="hours">
      <div className="section-heading">
        <p className="eyebrow">{t("hours.eyebrow")}</p>
        <h2>{t("hours.title")}</h2>
        <p>
          {salon?.address}
          <br />
          {salon?.city}
        </p>
      </div>

      <div className="hours-panel">
        <ul className="hours-list">
          {WEEKDAYS.map((day, weekday) => {
            const hour = byDay.get(weekday);
            const label = hour ? `${hour.startTime} – ${hour.endTime}` : t("closed");
            return (
              <li key={day}>
                <span>{t(weekdayKey(weekday))}</span>
                <span className={hour ? undefined : "closed"}>{label}</span>
              </li>
            );
          })}
        </ul>
        <aside>
          {salon?.phone ? (
            <p>
              <a href={`tel:${salon.phone.replace(/\s/g, "")}`}>{salon.phone}</a>
            </p>
          ) : null}
          {salon?.email ? (
            <p>
              <a href={`mailto:${salon.email}`}>{salon.email}</a>
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
