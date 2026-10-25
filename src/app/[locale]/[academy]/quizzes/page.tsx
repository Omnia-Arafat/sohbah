import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QuizzesClient, type QuizzesTab } from "./quizzes-client";

type QuizzesPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({
  params,
}: QuizzesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quizzes" });
  return { title: t("title") };
}

/**
 * الاختبارات — both kinds, in the one place the bottom bar points at.
 *
 * Client-rendered for the same reason صفحتي and the self-test are: which
 * quizzes are hers depends on which circles she attends, and who she is lives
 * only in her own browser.
 */
export default async function QuizzesPage({ params, searchParams }: QuizzesPageProps) {
  const { locale, academy: academySlug } = await params;
  const { tab } = await searchParams;
  const initialTab: QuizzesTab = tab === "homework" || tab === "self" ? tab : "teacher";
  setRequestLocale(locale);

  const t = await getTranslations("quizzes");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  // Staff sit quizzes too — even the معلمة who wrote one — under their own
  // student row; see staffAsStudent.
  const isStaff = isActiveTeacher(await getTeacherSession());

  return <QuizzesClient academySlug={academySlug} locale={locale} isStaff={isStaff} initialTab={initialTab} />;
}
