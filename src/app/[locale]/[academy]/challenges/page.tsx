import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { ChallengesClient } from "./challenges-client";

type ChallengesPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: ChallengesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "challenges" });
  return { title: t("title") };
}

/**
 * التحديات — every running challenge, for students and staff alike.
 *
 * The list is read on the client: which حلقة challenges a student sees
 * depends on who she is, and that lives in her browser (me-store.ts), not in
 * a session the server could read.
 */
export default async function ChallengesPage({ params }: ChallengesPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const session = await getTeacherSession();
  const staff = isActiveTeacher(session);

  return (
    <ChallengesClient
      academySlug={academySlug}
      locale={locale}
      isStaff={staff}
      canSupervise={staff && canSupervise(session.teacher)}
    />
  );
}
