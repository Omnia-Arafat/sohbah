import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PartnerClient } from "./partner-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Client-rendered for the same reason as the rest of `/me`: the reader's
 *  identity lives in her own browser, not in a session. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "partner" });
  return { title: t("title") };
}

export default async function PartnerPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("partner");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  return <PartnerClient academySlug={academySlug} />;
}
