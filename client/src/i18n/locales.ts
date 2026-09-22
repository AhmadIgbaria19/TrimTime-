export const LOCALES = ["en", "ar", "he"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = "trimtime_locale";

export const LOCALE_DIR: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
  he: "rtl",
};

export const LOCALE_INTL: Record<Locale, string> = {
  en: "en-US",
  ar: "ar",
  he: "he",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "ar" || value === "he";
}
