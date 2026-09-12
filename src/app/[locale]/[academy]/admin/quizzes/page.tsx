import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink, ChevronForward } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadCurricula } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { deleteQuiz, setQuizPublished } from "./actions";
import { QuizForm, type QuizScopeCircle } from "./quiz-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.quizzes" });
  return { title: t("title") };
}

export default async function QuizzesPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const session = await requireStaffSession(`/${academySlug}/admin/quizzes`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.quizzes");
  const supabase = await createClient();

  const [circleTypes, curricula, { data: circleRows }, { data: quizzes }] =
    await Promise.all([
      loadCircleTypes(supabase, academy.id),
      loadCurricula(supabase, academy.id),
      supabase
        .from("circles")
        .select("id, name, type, teachers(name)")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("quizzes")
        .select("*")
        .eq("academy_id", academy.id)
        .order("created_at", { ascending: false }),
    ]);

  const circles: QuizScopeCircle[] = (circleRows ?? []).map((row) => {
    // The embedded relation arrives as an object or a one-element array
    // depending on how PostgREST infers the cardinality; normalise both.
    const teacher = row.teachers as unknown as
      | { name: string }
      | { name: string }[]
      | null;
    const teacherName = Array.isArray(teacher)
      ? (teacher[0]?.name ?? "")
      : (teacher?.name ?? "");
    return { id: row.id, name: row.name, type: row.type, teacherName };
  });

  // How many questions each quiz holds — one query, not one per row. Publishing
  // is refused for a quiz with none, so the count has to be on the card.
  const quizIds = (quizzes ?? []).map((quiz) => quiz.id);
  const { data: questionRows } = quizIds.length
    ? await supabase.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds)
    : { data: [] };

  const questionCounts = new Map<string, number>();
  for (const row of questionRows ?? []) {
    questionCounts.set(row.quiz_id, (questionCounts.get(row.quiz_id) ?? 0) + 1);
  }

  const circleNames = new Map(circles.map((circle) => [circle.id, circle.name]));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("newTitle")}</h2>
        <QuizForm
          academySlug={academySlug}
          circleTypes={circleTypes}
          curricula={curricula}
          circles={circles}
          locale={locale}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("listTitle", { count: String(quizzes?.length ?? 0) })}
        </h2>

        {!quizzes || quizzes.length === 0 ? (
          <p className="card text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {quizzes.map((quiz) => {
              const count = questionCounts.get(quiz.id) ?? 0;
              const mayManage =
                canSupervise(session.teacher) ||
                quiz.created_by === session.teacher.id;

              return (
                <li key={quiz.id} className="card flex flex-col gap-3">
                  <Link
                    href={`/${academySlug}/admin/quizzes/${quiz.id}`}
                    className="flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {quiz.title}
                        <span
                          className={`ms-2 rounded-full px-2 py-0.5 text-xs font-normal ${
                            quiz.is_published
                              ? "bg-brand-100 text-brand-700"
                              : "bg-surface-subtle text-muted-foreground"
                          }`}
                        >
                          {quiz.is_published ? t("published") : t("draft")}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {circleTypeLabel(circleTypes, quiz.circle_type, locale)}
                        {" · "}
                        {quiz.circle_id
                          ? (circleNames.get(quiz.circle_id) ?? t("oneCircle"))
                          : t("allCircles")}
                        {" · "}
                        {t("questionCount", { count: String(count) })}
                      </p>
                    </div>
                    <ChevronForward />
                  </Link>

                  {mayManage && (
                    <div className="flex flex-wrap gap-2">
                      <form action={setQuizPublished}>
                        <input type="hidden" name="academySlug" value={academySlug} />
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <input
                          type="hidden"
                          name="isPublished"
                          value={quiz.is_published ? "0" : "1"}
                        />
                        {/*
                          A quiz with no questions cannot be published — the
                          action refuses it too, this just avoids offering a
                          button that would quietly do nothing.
                        */}
                        <button
                          type="submit"
                          className={
                            quiz.is_published
                              ? "btn-secondary px-4 py-2 text-sm"
                              : "btn-primary px-4 py-2 text-sm disabled:opacity-40"
                          }
                          disabled={!quiz.is_published && count === 0}
                        >
                          {quiz.is_published ? t("unpublish") : t("publish")}
                        </button>
                      </form>

                      <Link
                        href={`/${academySlug}/admin/quizzes/${quiz.id}/results`}
                        className="btn-secondary px-4 py-2 text-sm"
                      >
                        {t("results")}
                      </Link>

                      <form action={deleteQuiz}>
                        <input type="hidden" name="academySlug" value={academySlug} />
                        <input type="hidden" name="quizId" value={quiz.id} />
                        <ConfirmButton
                          label={t("delete")}
                          confirmMessage={t("confirmDelete", { name: quiz.title })}
                          className="btn-danger"
                        />
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
