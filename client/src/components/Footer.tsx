import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";

export function Footer() {
  const { catalog } = useSalon();
  const { t } = useLocale();

  return (
    <footer className="site-footer">
      <span>TrimTime</span>
      <span>
        {catalog?.salon.name ? t("footer.managed", { name: catalog.salon.name }) : t("footer.generic")}
      </span>
    </footer>
  );
}
