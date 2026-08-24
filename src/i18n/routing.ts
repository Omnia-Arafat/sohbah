import { defineRouting } from "next-intl/routing";

/**
 * Arabic is the default and lives at the unprefixed root (`/register`).
 * English is served under `/en` (`/en/register`).
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

/** Cookie the language toggle writes so the choice survives a return visit. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
