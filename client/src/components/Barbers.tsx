import { initialsFor } from "../api/catalog";
import { useSalon } from "../context/SalonContext";

export function Barbers() {
  const { catalog } = useSalon();
  const barbers = catalog?.barbers ?? [];

  return (
    <section className="section section-muted" id="barbers">
      <div className="section-heading">
        <p className="eyebrow">The chair</p>
        <h2>Barbers who own their hour.</h2>
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
