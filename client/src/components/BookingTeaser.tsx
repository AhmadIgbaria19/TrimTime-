import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";

export function BookingTeaser() {
  const { user } = useAuth();
  const { t } = useLocale();

  if (user?.role === "admin") {
    return (
      <section className="book-panel" id="book">
        <p className="eyebrow">{t("teaserAdmin.eyebrow")}</p>
        <h2>{t("teaserAdmin.title")}</h2>
        <p>{t("teaserAdmin.body")}</p>
        <Link className="btn btn-gold" to="/admin/bookings">
          {t("teaserAdmin.cta")}
        </Link>
      </section>
    );
  }

  return (
    <section className="book-panel" id="book">
      <p className="eyebrow">{t("teaser.eyebrow")}</p>
      <h2>{t("teaser.title")}</h2>
      <p>{t("teaser.body")}</p>
      <Link className="btn btn-gold" to="/book">
        {user ? t("teaser.checkTimes") : t("teaser.seeTimes")}
      </Link>
    </section>
  );
}
