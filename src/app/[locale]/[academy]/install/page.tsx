import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { InstallClient } from "./install-client";

type InstallPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Instructions, not data — the same for everyone and for as long as it exists. */
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: InstallPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "install" });
  return { title: t("title") };
}

/**
 * A link that can be sent, which is what was actually asked for.
 *
 * The app has been installable for a while — manifest, icons, HTTPS — and
 * almost nobody had installed it, because installing a web app is a thing you
 * have to be TOLD about. Android buries it in a menu and iOS buries it in the
 * share sheet, and neither says a word to a first-time visitor.
 *
 * So the deliverable is a URL: /install. One link to WhatsApp to the whole
 * academy, that works out which phone the reader is holding and shows only
 * what she can actually do on it. `InstallClient` carries that reasoning; the
 * detection has to be on the client because none of it is knowable on the
 * server.
 */
export default async function InstallPage({ params }: InstallPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  return <InstallClient academySlug={academySlug} />;
}
