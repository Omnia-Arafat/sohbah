import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ResultClient } from "./result-client";

type ResultPageProps = {
  params: Promise<{ locale: string; academy: string; attemptId: string }>;
};

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quizResult" });
  return { title: t("title") };
}

/**
 * نتيجة اختبار — the marked paper of one finished attempt.
 *
 * Reached from the screen she sees on submitting, from نتائجك in الاختبارات,
 * and from the quiz link itself once her attempts are spent. The attempt id in
 * the URL is the credential, as it is while she sits the quiz.
 */
export default async function ResultPage({ params }: ResultPageProps) {
  const { locale, academy: academySlug, attemptId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("quizResult");

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/${academySlug}/quizzes`}>{t("back")}</BackLink>
      <ResultClient attemptId={attemptId} />
    </div>
  );
}
