import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { WeeksClient } from "./weeks-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const metadata: Metadata = { title: "جداول الأسابيع" };

/**
 * «جداول الأسابيع»: every week of her track up to this one, to read again and
 * download. Client-rendered like the rest of /me: who she is lives in her
 * own browser.
 */
export default async function TrackWeeksPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">جداول الأسابيع</h1>
        <SetupNotice />
      </div>
    );
  }

  return <WeeksClient academySlug={academySlug} />;
}
