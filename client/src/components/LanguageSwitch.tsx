import { useLocale } from "../context/LocaleContext";
import type { Locale } from "../i18n/locales";
import { LOCALES } from "../i18n/locales";
import type { MessageKey } from "../i18n/messages";

const LABELS: Record<Locale, MessageKey> = {
  en: "lang.en",
  ar: "lang.ar",
  he: "lang.he",
};

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {LOCALES.map((item) => (
        <button
          key={item}
          className={item === locale ? "lang-btn is-active" : "lang-btn"}
          type="button"
          aria-pressed={item === locale}
          onClick={() => setLocale(item)}
        >
          {t(LABELS[item])}
        </button>
      ))}
    </div>
  );
}
