import { initialsFor } from "../api/catalog";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";

export function Barbers() {
  const { catalog } = useSalon();
  const { t } = useLocale();
  const barbers = catalog?.barbers ?? [];

  return (
    <section className="section section-muted" id="barbers">
      <div className="section-heading">
        <p className="eyebrow">{t("barbers.eyebrow")}</p>
        <h2>{t("barbers.title")}</h2>
      </div>

      <ul className="barber-grid">
        {barbers.map((barber) => (
          <li key={barber.id} className="barber-card">
            <div className="barber-photo" aria-hidden="true">
              {barber.photoUrl ? <img src={barber.photoUrl} alt="" /> : <span>{initialsFor(barber.name)}</span>}
            </div>
            <h3>{barber.name}</h3>
            <p className="barber-role">{barber.roleTitle}</p>
            <p>{barber.focus}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
