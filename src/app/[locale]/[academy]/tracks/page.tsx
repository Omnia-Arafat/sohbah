import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TracksClient } from "./tracks-client";

type TracksPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: TracksPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studentHome.tracksPage" });
  return { title: t("title") };
}

/**
 * مساراتي: one card per track she is on, each opening its ورد اليوم.
 *
 * A student is on one track today; the list shape is here so a second one
 * needs no new screen when enrolment in several is allowed.
 */
export default async function TracksPage({ params }: TracksPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  return <TracksClient academySlug={academySlug} />;
}
