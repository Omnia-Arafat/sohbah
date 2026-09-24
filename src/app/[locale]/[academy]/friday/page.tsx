import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CounterClient } from "./counter-client";

type FridayPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: FridayPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friday" });
  return { title: t("salawatTitle") };
}

/**
 * The الصلاة على النبي counter.
 *
 * Rendered on the client: the count lives on her phone first and the window
 * is her own مغرب, so the server has nothing to render it from — the same
 * reason صفحتي is a client page.
 */
export default async function FridayPage({ params }: FridayPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  return <CounterClient academySlug={academySlug} locale={locale} />;
}
