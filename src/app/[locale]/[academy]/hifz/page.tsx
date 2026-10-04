import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HifzClient } from "./hifz-client";

type HifzPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: HifzPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studentHome.hifzPage" });
  return { title: t("title") };
}

/**
 * صفحة الحفظ: the thirty أجزاء as one ring, one جزء in focus at a time, and the
 * ones due for review in order.
 *
 * It replaced the 6×5 grid that sat on صفحتي. Everything is read on the client,
 * for the reason the rest of her record is: who she is lives in her browser.
 */
export default async function HifzPage({ params }: HifzPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  return <HifzClient academySlug={academySlug} />;
}
