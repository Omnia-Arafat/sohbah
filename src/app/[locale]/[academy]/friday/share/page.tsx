import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { ShareClient } from "./share-client";

type SharePageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friday" });
  return { title: t("shareTitle") };
}

/**
 * The image she sends to the WhatsApp group.
 *
 * A معلمة's name comes from her session here; a student's comes from صفحتي
 * in her own browser, so it is filled in on the client.
 */
export default async function SharePage({ params }: SharePageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const session = await getTeacherSession();
  const staffName = isActiveTeacher(session) ? session.teacher.name : null;

  return <ShareClient academySlug={academySlug} locale={locale} staffName={staffName} />;
}
