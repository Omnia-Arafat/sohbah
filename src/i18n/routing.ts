import { defineRouting } from "next-intl/routing";

/**
 * Every URL carries the locale prefix: /ar/sohbah, /en/sohbah.
 * This keeps routing unambiguous — without it Next.js cannot distinguish
 * /sohbah (locale segment?) from /ar/sohbah ([locale]/[academy]).
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

/** Cookie the language toggle writes so the choice survives a return visit. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
