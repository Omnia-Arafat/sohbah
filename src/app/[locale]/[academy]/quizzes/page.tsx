import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { QuizzesClient } from "./quizzes-client";

type QuizzesPageProps = {
  params: Promise<{ locale: string; academy: string }>;
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
export default async function QuizzesPage({ params }: QuizzesPageProps) {
  const { locale, academy: academySlug } = await params;
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

  return <QuizzesClient academySlug={academySlug} locale={locale} />;
}
