import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SelfTestClient } from "./self-test-client";

type SelfTestPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({
  params,
}: SelfTestPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "selfTest" });
  return { title: t("title") };
}

/**
 * اختبري حفظك — the centre action of the student's bottom bar.
 *
 * Rendered on the client for the same reason صفحتي is: the most useful scope
 * it can offer — "the أجزاء that are fading on your map" — comes from her own
 * record, and who she is lives only in her browser.
 */
export default async function SelfTestPage({ params }: SelfTestPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("selfTest");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  return <SelfTestClient academySlug={academySlug} locale={locale} />;
}
