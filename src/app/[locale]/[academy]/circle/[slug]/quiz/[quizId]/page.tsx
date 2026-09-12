import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { createClient } from "@/lib/supabase/server";
import { startAttempt } from "./actions";
import { QuizClient } from "./quiz-client";

type PageProps = {
  params: Promise<{
    locale: string;
    academy: string;
    slug: string;
    quizId: string;
  }>;
};

/** A student's page, but never cacheable: the quiz window is time-sensitive. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quiz" });
  return { title: t("title") };
}

export default async function TakeQuizPage({ params }: PageProps) {
  const { locale, academy: academySlug, slug, quizId } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("quiz");
  const supabase = await createClient();

  // `circle_quizzes` already answers "is this quiz open to this circle right
  // now" — scope, published, and the time window all at once. Reading the quiz
  // through it rather than from the table means a student cannot reach a draft
  // or a closed paper by guessing its id.
  const { data: quizzes, error } = await supabase.rpc("circle_quizzes", {
    p_slug: slug,
  });

  if (error) console.error("circle_quizzes failed", error);

  const quiz = quizzes?.find((row) => row.id === quizId);
  if (!quiz) notFound();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/circle/${slug}`}>{t("backToCircle")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {quiz.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("questionCount", { count: String(quiz.question_count) })}
          {quiz.duration_minutes
            ? ` · ${t("durationLabel", { minutes: String(quiz.duration_minutes) })}`
            : ""}
        </p>
      </section>

      <QuizClient
        slug={slug}
        quizId={quiz.id}
        title={quiz.title}
        instructions={quiz.instructions}
        startAction={async (formData) => {
          "use server";
          // `useActionState`'s shape is not what this needs — the client keeps
          // its own pending flag — so the previous-state argument is filled in
          // here rather than threaded through.
          const outcome = await startAttempt({ status: "idle" }, formData);
          return outcome.status === "started"
            ? outcome
            : { status: "error" as const, reason: "reason" in outcome ? outcome.reason : "generic" };
        }}
      />
    </div>
  );
}
