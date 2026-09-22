import { useSalon } from "../context/SalonContext";
import { useLocale } from "../context/LocaleContext";
import { Barbers } from "../components/Barbers";
import { BookingTeaser } from "../components/BookingTeaser";
import { Hero } from "../components/Hero";
import { Hours } from "../components/Hours";
import { Services } from "../components/Services";

export function HomePage() {
  const { loading, error } = useSalon();
  const { t, tApi } = useLocale();

  if (loading) {
    return (
      <main className="auth-page">
        <p>{t("loadingAtelier")}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>{t("home.loadError")}</h1>
          <p className="lede">{tApi(error)}</p>
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
