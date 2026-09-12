import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { LessonCard } from "@/components/lesson-card";
import { CircleClient } from "./circle-client";

type CirclePageProps = {
  params: Promise<{ locale: string; academy: string; slug: string }>;
};

async function loadCircle(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("circle_public_info", {
    p_slug: slug,
  });

  if (error) {
    console.error("circle_public_info failed", error);
    return null;
  }
  return data?.[0] ?? null;
}

export async function generateMetadata({
  params,
}: CirclePageProps): Promise<Metadata> {
  const { locale, academy: academySlug, slug } = await params;
  const t = await getTranslations({ locale, namespace: "circle" });

  if (!isSupabaseConfigured()) return { title: t("title") };

  const circle = await loadCircle(slug);
  return { title: circle?.name ?? t("notFoundPage.title") };
}

export default async function CirclePage({ params }: CirclePageProps) {
  const { locale, academy: academySlug, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("circle");
  const tQuiz = await getTranslations("quiz");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  const circle = await loadCircle(slug);
  if (!circle) notFound();

  const supabase = await createClient();
  const [{ data: queue }, { data: lessonRows }, { data: quizRows }, circleTypes] =
    await Promise.all([
      supabase.rpc("circle_queue", { p_slug: slug }),
      // The day's lesson, through the same SECURITY DEFINER function the
      // teacher's screen reads — a student is anonymous and never touches
      // `curriculum_units` directly.
      supabase.rpc("circle_lesson", { p_slug: slug }),
      supabase.rpc("circle_quizzes", { p_slug: slug }),
      // `activeOnly: false` — the circle's own type must still show a real
      // label here even if a supervisor has since deactivated it.
      loadCircleTypes(supabase, circle.academy_id, { activeOnly: false }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <p className="text-sm text-muted-foreground">
          {circleTypeLabel(circleTypes, circle.type, locale)}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">
          {circle.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("startsAt", { time: formatTime(circle.start_time, locale) })}
        </p>

        {!circle.meets_today && (
          <p className="mt-3 text-sm text-accent-700 dark:text-accent-300">
            {t("notToday")}
          </p>
        )}
      </section>

      {lessonRows?.[0] && <LessonCard lesson={lessonRows[0]} locale={locale} />}

      {/*
        Only quizzes that are published, in scope for this circle, and inside
        their time window — `circle_quizzes()` applies all three, so nothing
        here has to re-derive "is this one available".
      */}
      {(quizRows?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{tQuiz("available")}</h2>
          <ul className="flex flex-col gap-3">
            {quizRows!.map((quiz) => (
              <li key={quiz.id}>
                <Link
                  href={`/${academySlug}/circle/${slug}/quiz/${quiz.id}`}
                  className="card flex items-center gap-3 hover:border-brand-600 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{quiz.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {tQuiz("questionCount", { count: String(quiz.question_count) })}
                      {quiz.duration_minutes
                        ? ` · ${tQuiz("durationLabel", { minutes: String(quiz.duration_minutes) })}`
                        : ""}
                    </p>
                  </div>
                  <span className="btn-primary shrink-0 px-4 py-2 text-sm">
                    {tQuiz("open")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CircleClient
        academySlug={academySlug}
        slug={slug}
        circleId={circle.id}
        sessionDate={circle.session_date}
        sessionLink={circle.session_link}
        initialQueue={queue ?? []}
        maxStudents={circle.max_students}
      />
    </div>
  );
}
