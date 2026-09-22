import { useLocale } from "../context/LocaleContext";

export function DemoBanner() {
  const { t } = useLocale();
  return <p className="demo-banner">{t("demoBanner")}</p>;
}
