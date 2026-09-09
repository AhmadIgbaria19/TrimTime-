import { useSalon } from "../context/SalonContext";

export function Footer() {
  const { catalog } = useSalon();

  return (
    <footer className="site-footer">
      <span>TrimTime</span>
      <span>
        {catalog?.salon.name
          ? `${catalog.salon.name} details are managed by the salon owner.`
          : "Salon name, logo, and barbers are managed by the owner."}
      </span>
    </footer>
  );
}
