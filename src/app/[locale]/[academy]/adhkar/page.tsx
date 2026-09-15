import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { AdhkarClient } from "./adhkar-client";

type AdhkarPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** The أذكار do not change, and nothing here belongs to one student. */
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: AdhkarPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "adhkar" });
  return { title: t("title") };
}

/**
 * أذكار الصباح والمساء.
 *
 * The screen itself is `AdhkarClient` — it has to be, because the two things
 * that decide what it shows are the clock and this browser's own storage, and
 * neither is knowable here. All this route does is exist, so the أذكار have a
 * URL of their own.
 */
export default async function AdhkarPage({ params }: AdhkarPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  return <AdhkarClient />;
}
