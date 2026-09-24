import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KahfClient } from "./kahf-client";

type KahfPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: KahfPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friday" });
  return { title: t("kahfTitle") };
}

export default async function KahfPage({ params }: KahfPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  return <KahfClient academySlug={academySlug} locale={locale} />;
}
