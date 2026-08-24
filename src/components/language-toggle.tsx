"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_COOKIE, type Locale } from "@/i18n/routing";

/**
 * Switches between Arabic and English on the current route and persists the
 * choice in a cookie, which `src/proxy.ts` reads on the next visit.
 */
export function LanguageToggle() {
  const t = useTranslations("language");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const next: Locale = locale === "ar" ? "en" : "ar";

  function switchLocale() {
    // One year, site-wide.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={isPending}
      aria-label={t("switchTo")}
      className="btn-secondary px-3 py-2 text-sm"
    >
      {t(next)}
    </button>
  );
}
