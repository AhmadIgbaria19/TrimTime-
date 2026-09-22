import { formatPrice } from "../api/catalog";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";

export function Services() {
  const { catalog } = useSalon();
  const { t } = useLocale();
  const services = catalog?.services ?? [];

  return (
    <section className="section" id="services">
      <div className="section-heading">
        <p className="eyebrow">{t("services.eyebrow")}</p>
        <h2>{t("services.title")}</h2>
        <p>{t("services.lede")}</p>
      </div>

      <ul className="service-grid">
        {services.map((service) => (
          <li key={service.id} className="service-card">
            <div className="service-meta">
              <span>{t("durationMinutes", { n: service.durationMinutes })}</span>
              <span>{formatPrice(service.priceIls)}</span>
            </div>
            <h3>{service.name}</h3>
            <p>{service.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
