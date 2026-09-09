import { useSalon } from "../context/SalonContext";
import { Barbers } from "../components/Barbers";
import { BookingTeaser } from "../components/BookingTeaser";
import { Hero } from "../components/Hero";
import { Hours } from "../components/Hours";
import { Services } from "../components/Services";

export function HomePage() {
  const { loading, error } = useSalon();

  if (loading) {
    return (
      <main className="auth-page">
        <p>Loading the atelier…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>The salon could not load</h1>
          <p className="lede">{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <Hero />
      <Services />
      <Barbers />
      <Hours />
      <BookingTeaser />
    </main>
  );
}
