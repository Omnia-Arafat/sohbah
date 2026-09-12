import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadCurricula, loadUnits } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { setQuizPublished } from "../actions";
import { deleteQuestion } from "./actions";
import { QuestionForm } from "./question-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.quizzes" });
  return { title: t("title") };
}

export default async function QuizBuilderPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  await requireStaffSession(`/${academySlug}/admin/quizzes/${id}`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.quizzes");
  const tQ = await getTranslations("admin.quizzes.questions");
  const supabase = await createClient();

  // RLS scopes this to the caller's academy; an id from elsewhere 404s.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .maybeSingle();

  if (!quiz) notFound();

  const [circleTypes, questionsResult] = await Promise.all([
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
    supabase
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", quiz.id)
      .order("position"),
  ]);

  const questions = questionsResult.data ?? [];

  // Options in one query keyed back by question, rather than a PostgREST
  // embed: `database.types.ts` is hand-written and declares no relationships,
  // so an embed would come back untyped.
  const { data: optionRows } = questions.length
    ? await supabase
        .from("quiz_options")
        .select("*")
        .in("question_id", questions.map((question) => question.id))
        .order("position")
    : { data: [] };

  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const option of optionRows ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  }

  // Units to tag a question with. Scoped to the quiz's curriculum when it has
  // one, otherwise to every curriculum of its circle type — the same widening
  // the quiz's own scope uses.
  const curricula = quiz.curriculum_id
    ? await loadCurricula(supabase, academy.id).then((all) =>
        all.filter((curriculum) => curriculum.id === quiz.curriculum_id),
      )
    : await loadCurricula(supabase, academy.id, { circleType: quiz.circle_type });

  const unitLists = await Promise.all(
    curricula.map((curriculum) => loadUnits(supabase, curriculum.id, { activeOnly: true })),
  );
  const units = unitLists.flat();

  const totalPoints = questions.reduce((sum, q) => sum + Number(q.points), 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/quizzes`}>{t("backToList")}</BackLink>
        <p className="mt-2 text-sm text-muted-foreground">
          {circleTypeLabel(circleTypes, quiz.circle_type, locale)}
          {" · "}
          {quiz.circle_id ? t("oneCircle") : t("allCircles")}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">
          {quiz.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("questionCount", { count: String(questions.length) })}
          {" · "}
          {t("totalPoints", { points: String(totalPoints) })}
          {quiz.duration_minutes
            ? ` · ${t("durationLabel", { minutes: String(quiz.duration_minutes) })}`
            : ""}
        </p>

        <div className="mt-4">
          <form action={setQuizPublished}>
            <input type="hidden" name="academySlug" value={academySlug} />
            <input type="hidden" name="quizId" value={quiz.id} />
            <input
              type="hidden"
              name="isPublished"
              value={quiz.is_published ? "0" : "1"}
            />
            <button
              type="submit"
              className={
                quiz.is_published
                  ? "btn-secondary px-4 py-2 text-sm"
                  : "btn-primary px-4 py-2 text-sm disabled:opacity-40"
              }
              disabled={!quiz.is_published && questions.length === 0}
            >
              {quiz.is_published ? t("unpublish") : t("publish")}
            </button>
          </form>
          {!quiz.is_published && questions.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">{t("needQuestions")}</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {tQ("listTitle", { count: String(questions.length) })}
        </h2>

        {questions.length === 0 ? (
          <p className="card text-muted-foreground">{tQ("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {questions.map((question) => {
              const options = optionsByQuestion.get(question.id) ?? [];

              return (
                <li key={question.id} className="card flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                      {question.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{question.prompt}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {tQ(`kinds.${question.kind}`)}
                        {" · "}
                        {tQ("points", { points: String(question.points) })}
                      </p>

                      {options.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1">
                          {options.map((option) => (
                            <li
                              key={option.id}
                              className={`flex items-center gap-2 text-sm ${
                                option.is_correct
                                  ? "font-medium text-brand-700 dark:text-brand-300"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {/*
                                Safe to show here: this page is staff-only. The
                                student's copy comes from quiz_for_student(),
                                which never selects is_correct at all.
                              */}
                              {option.is_correct && (
                                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                              )}
                              <span>{option.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {question.kind === "short_text" && (
                        <p className="mt-2 text-sm text-accent-700 dark:text-accent-300">
                          {tQ("manualNote")}
                        </p>
                      )}
                    </div>
                  </div>

                  <form action={deleteQuestion}>
                    <input type="hidden" name="academySlug" value={academySlug} />
                    <input type="hidden" name="quizId" value={quiz.id} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <ConfirmButton
                      label={tQ("delete")}
                      confirmMessage={tQ("confirmDelete")}
                      className="btn-danger"
                    />
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{tQ("addTitle")}</h2>
        <QuestionForm
          academySlug={academySlug}
          quizId={quiz.id}
          units={units}
          locale={locale}
        />
      </section>
    </div>
  );
}
