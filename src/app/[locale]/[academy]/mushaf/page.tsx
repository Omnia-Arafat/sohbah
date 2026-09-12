import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MushafIndexClient } from "./mushaf-index-client";

type MushafIndexProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Fixed for all readers and all time, like the pages themselves. */
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: MushafIndexProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mushaf" });
  return { title: t("indexTitle") };
}

/**
 * The mushaf's index.
 *
 * This route used to redirect straight to page 1, which made the reader's
 * index button a link back to where you already were — it looked broken
 * because it was. It is now what the button always implied: the 114 surahs to
 * search and pick from, the 30 أجزاء, and a box to jump to a page number.
 */
export default async function MushafIndex({ params }: MushafIndexProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  return <MushafIndexClient academySlug={academySlug} locale={locale} />;
}
