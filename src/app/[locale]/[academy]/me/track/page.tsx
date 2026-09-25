import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { TrackClient } from "./track-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/**
 * ورد اليوم.
 *
 * Client-rendered for the same reason as the rest of `/me`: who the reader is
 * lives in her own browser, so the server has nothing to render a personalised
 * page from, and her name and phone stay off every server log between here and
 * her.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trackDay" });
  return { title: t("title") };
}

export default async function TrackDayPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("trackDay");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  return <TrackClient academySlug={academySlug} locale={locale} />;
}
