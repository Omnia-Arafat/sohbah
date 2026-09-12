import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.quizzes.resultsPage" });
  return { title: t("title") };
}

export default async function QuizResultsPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  await requireStaffSession(`/${academySlug}/admin/quizzes/${id}/results`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.quizzes.resultsPage");
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .maybeSingle();

  if (!quiz) notFound();

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("*")
    .eq("quiz_id", quiz.id)
    .order("submitted_at", { ascending: false, nullsFirst: false });

  // Names come from `students`, which a معلمة may only read for students in
  // her own circles (`students_select_own_circles`). So a name can legitimately
  // come back missing here — that is the policy working, not an error, and the
  // row still shows with its score.
  const studentIds = [...new Set((attempts ?? []).map((a) => a.student_id))];
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, name, father_name").in("id", studentIds)
    : { data: [] };

  const names = new Map(
    (students ?? []).map((s) => [s.id, `${s.name} ${s.father_name}`.trim()]),
  );

  const submitted = (attempts ?? []).filter((a) => a.status !== "in_progress");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/quizzes/${quiz.id}`}>
          {t("back")}
        </BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {quiz.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("attemptCount", { count: String(submitted.length) })}
        </p>
      </section>

      {submitted.length === 0 ? (
        <p className="card text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {submitted.map((attempt) => {
            const score = Number(attempt.auto_score ?? 0);
            const max = Number(attempt.max_score ?? 0);
            const pct = max > 0 ? Math.round((score / max) * 100) : 0;
            const passed = pct >= Number(quiz.pass_score);

            return (
              <li key={attempt.id} className="card flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {names.get(attempt.student_id) ?? t("hiddenName")}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {attempt.submitted_at
                      ? new Date(attempt.submitted_at).toLocaleString(locale)
                      : t("notSubmitted")}
                    {attempt.attempt_no > 1
                      ? ` · ${t("attemptNo", { n: String(attempt.attempt_no) })}`
                      : ""}
                  </p>
                </div>

                <div className="text-end">
                  <p className="text-lg font-bold" dir="ltr">
                    {score} / {max}
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      passed
                        ? "text-brand-700 dark:text-brand-300"
                        : "text-accent-700 dark:text-accent-300"
                    }`}
                  >
                    {pct}%
                    {attempt.status === "submitted"
                      ? ` · ${t("awaitingMarking")}`
                      : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Marking written answers by hand is the one thing this page does not do
        yet — `quiz_answers.is_correct` stays null for them and the attempt
        stays 'submitted' rather than 'graded'. Flagged here so the state is
        visible rather than silently wrong.
      */}
      <p className="text-sm text-muted-foreground">{t("manualNote")}</p>
    </div>
  );
}
