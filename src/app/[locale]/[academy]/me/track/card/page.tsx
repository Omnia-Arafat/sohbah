import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { CardClient } from "./card-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "card" });
  return { title: t("title") };
}

export default async function CardPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("card");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  return <CardClient academySlug={academySlug} locale={locale} />;
}
