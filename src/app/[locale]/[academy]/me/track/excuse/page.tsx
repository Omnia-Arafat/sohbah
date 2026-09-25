import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { ExcuseClient } from "./excuse-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "excuse" });
  return { title: t("title") };
}

/** Today in the academy's timezone — the same clock the day screen uses, so
 *  "no day after today" means the same thing on both. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ExcusePage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("excuse");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  return <ExcuseClient academySlug={academySlug} today={today()} />;
}
