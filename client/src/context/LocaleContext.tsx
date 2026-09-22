import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { interpolate } from "../i18n/interpolate";
import {
  isLocale,
  LOCALE_DIR,
  LOCALE_INTL,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "../i18n/locales";
import { apiErrors, messages, type MessageKey } from "../i18n/messages";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type LocaleContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  intl: string;
  setLocale: (locale: Locale) => void;
  t: Translate;
  tApi: (message: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = LOCALE_DIR[locale];
  document.title = messages[locale].title;
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    /* private mode */
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = readStoredLocale();
    applyDocumentLocale(initial);
    return initial;
  });

  const value = useMemo<LocaleContextValue>(() => {
    const t: Translate = (key, vars) =>
      interpolate(messages[locale][key] ?? messages.en[key] ?? key, vars);

    return {
      locale,
      dir: LOCALE_DIR[locale],
      intl: LOCALE_INTL[locale],
      setLocale(next) {
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, next);
        } catch {
          /* private mode */
        }
        applyDocumentLocale(next);
        setLocaleState(next);
      },
      t,
      tApi(message) {
        return apiErrors[locale][message] ?? apiErrors.en[message] ?? message;
      },
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return value;
}
