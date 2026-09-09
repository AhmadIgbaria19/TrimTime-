import { formatDuration, formatPrice } from "../api/catalog";
import { useSalon } from "../context/SalonContext";

export function Services() {
  const { catalog } = useSalon();
  const services = catalog?.services ?? [];

  return (
    <section className="section" id="services">
      <div className="section-heading">
        <p className="eyebrow">The menu</p>
        <h2>Services, priced with time in mind.</h2>
        <p>
          Durations are exact. A 30-minute cut and a 40-minute fade never share
          the same grid — each appointment is sized to the work.
        </p>
      </div>

      <ul className="service-grid">
        {services.map((service) => (
          <li key={service.id} className="service-card">
            <div className="service-meta">
              <span>{formatDuration(service.durationMinutes)}</span>
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
