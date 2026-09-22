import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";

export function Hero() {
  const { user } = useAuth();
  const { catalog } = useSalon();
  const { t } = useLocale();
  const salon = catalog?.salon;
  const services = catalog?.services ?? [];
  const barbers = catalog?.barbers ?? [];
  const longest = Math.max(0, ...services.map((service) => service.durationMinutes));

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">{t("hero.eyebrow", { city: salon?.city || "Jerusalem" })}</p>
        <h1>
          {t("hero.titleLead")}
          <em> {t("hero.titleEm")}</em>
        </h1>
        <p className="lede">{t("hero.lede")}</p>
        <div className="hero-actions">
          {user?.role === "admin" ? (
            <>
              <Link className="btn btn-gold" to="/admin">
                {t("hero.openDashboard")}
              </Link>
              <Link className="btn btn-ghost" to="/admin/bookings">
                {t("hero.manageBookings")}
              </Link>
            </>
          ) : (
            <>
              <Link className="btn btn-gold" to="/book">
                {t("hero.book")}
              </Link>
              <a className="btn btn-ghost" href="/#services">
                {t("hero.viewServices")}
              </a>
            </>
          )}
        </div>
        <ul className="hero-stats">
          <li>
            <strong>{services.length || "—"}</strong>
            <span>{t("hero.statServices")}</span>
          </li>
          <li>
            <strong>{barbers.length || "—"}</strong>
            <span>{t("hero.statBarbers")}</span>
          </li>
          <li>
            <strong>{longest || "—"}</strong>
            <span>{t("minutesLongest")}</span>
          </li>
        </ul>
      </div>

      <figure className="hero-frame">
        <img src={salon?.heroImageUrl || "/images/atelier.jpg"} alt={t("hero.interiorAlt")} />
        <figcaption>{salon?.tagline}</figcaption>
      </figure>
    </section>
  );
}
