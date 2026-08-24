import { useTranslations } from "next-intl";

/**
 * Shown instead of live data when Supabase credentials are missing, so the app
 * is browsable before a project exists rather than throwing on every page.
 */
export function SetupNotice() {
  const t = useTranslations("setup");

  return (
    <div className="rounded-xl border border-accent-300 bg-accent-100 p-4 text-accent-700">
      <p className="font-semibold">{t("title")}</p>
      <p className="mt-1 text-sm">{t("body")}</p>
      <code className="mt-2 block text-xs" dir="ltr">
        .env.local → NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      </code>
    </div>
  );
}
