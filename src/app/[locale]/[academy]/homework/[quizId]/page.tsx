import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { HomeworkClient } from "./homework-client";

type PageProps = {
  params: Promise<{ locale: string; academy: string; quizId: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "homework" });
  return { title: t("title") };
}

/**
 * One واجب, solved a question at a time and checked as she goes. Client-
 * rendered like الاختبارات: who she is lives in her own browser.
 */
export default async function HomeworkPage({ params }: PageProps) {
  const { locale, academy: academySlug, quizId } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("homework");
  const isStaff = isActiveTeacher(await getTeacherSession());

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/${academySlug}/quizzes?tab=homework`}>{t("back")}</BackLink>
      <HomeworkClient academySlug={academySlug} quizId={quizId} isStaff={isStaff} />
    </div>
  );
}
