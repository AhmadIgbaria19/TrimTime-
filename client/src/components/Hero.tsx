import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSalon } from "../context/SalonContext";

export function Hero() {
  const { user } = useAuth();
  const { catalog } = useSalon();
  const salon = catalog?.salon;
  const services = catalog?.services ?? [];
  const barbers = catalog?.barbers ?? [];
  const longest = Math.max(0, ...services.map((service) => service.durationMinutes));

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Private chair · {salon?.city || "Jerusalem"}</p>
        <h1>
          The cut that
          <em> holds.</em>
        </h1>
        <p className="lede">
          A single atelier for considered haircuts, slow shaves, and barbers who
          work with time — not against it.
        </p>
        <div className="hero-actions">
          {user?.role === "admin" ? (
            <>
              <Link className="btn btn-gold" to="/admin">
                Open dashboard
              </Link>
              <Link className="btn btn-ghost" to="/admin/bookings">
                Manage bookings
              </Link>
            </>
          ) : (
            <>
              <Link className="btn btn-gold" to="/book">
                Book an Appointment
              </Link>
              <a className="btn btn-ghost" href="/#services">
                View services
              </a>
            </>
          )}
        </div>
        <ul className="hero-stats">
          <li>
            <strong>{services.length || "—"}</strong>
            <span>signature services</span>
          </li>
          <li>
            <strong>{barbers.length || "—"}</strong>
            <span>resident barbers</span>
          </li>
          <li>
            <strong>{longest || "—"}</strong>
            <span>min longest slot</span>
          </li>
        </ul>
      </div>

      <figure className="hero-frame">
        <img
          src={salon?.heroImageUrl || "/images/atelier.jpg"}
          alt="The salon interior"
        />
        <figcaption>{salon?.tagline}</figcaption>
      </figure>
    </section>
  );
}
