"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardCheck, Lock, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { MyQuiz, MyQuizResult } from "@/lib/database.types";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";

/**
 * الاختبارات — two tabs, because there are two different things here and a
 * student cares about the difference.
 *
 * What her معلمة set has a window that opens and closes, a limited number of
 * attempts, and a score that goes into her record. What she sets herself is
 * unlimited, unrecorded, and available at four in the morning. Putting them in
 * one list would make the second look like homework and the first look
 * optional.
 *
 * The teacher tab gathers across every circle she attends. That is the whole
 * reason this screen exists: quizzes live on a circle's page, and a student in
 * three circles had to open three links to find out whether anything was set.
 */
export function QuizzesClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("quizzes");
  const supabase = useMemo(() => createClient(), []);
  const key = useMemo(() => meKey(academySlug), [academySlug]);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [tab, setTab] = useState<"teacher" | "self">("teacher");
  const [quizzes, setQuizzes] = useState<MyQuiz[] | null>(null);
  const [results, setResults] = useState<MyQuizResult[]>([]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    (async () => {
      const [open, done] = await Promise.all([
        supabase.rpc("my_quizzes", {
          p_student_id: me.studentId,
          p_phone: me.phone,
        }),
        supabase.rpc("my_quiz_results", {
          p_student_id: me.studentId,
          p_phone: me.phone,
        }),
      ]);
      if (cancelled) return;
      if (open.error) console.error("my_quizzes failed", open.error);
      if (done.error) console.error("my_quiz_results failed", done.error);
      setQuizzes((open.data ?? []) as MyQuiz[]);
      setResults((done.data ?? []) as MyQuizResult[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, me]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        {me && (
          <Link
            href={`/${academySlug}/me`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300"
          >
            <UserRound aria-hidden="true" className="h-4 w-4" />
            {t("myPage")}
          </Link>
        )}
      </header>

      <div
        role="tablist"
        className="grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-muted p-1.5"
      >
        <TabButton
          active={tab === "teacher"}
          onClick={() => setTab("teacher")}
          label={t("tabs.fromTeacher")}
        />
        <TabButton
          active={tab === "self"}
          onClick={() => setTab("self")}
          label={t("tabs.selfTest")}
        />
      </div>

      {tab === "self" ? (
        <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("selfIntro")}
          </p>
          <Link href={`/${academySlug}/self-test`} className="btn-primary mt-3 w-full">
            <ClipboardCheck aria-hidden="true" className="h-5 w-5" />
            {t("selfCta")}
          </Link>
        </section>
      ) : !me ? (
        /* A quiz records a score against a named student, so unlike the
           self-test there is nothing meaningful to show before we know who
           she is. She is sent to the one screen that asks. */
        <section className="card">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("signInPrompt")}
          </p>
          <Link href={`/${academySlug}/me`} className="btn-primary mt-3 w-full">
            {t("signInCta")}
          </Link>
        </section>
      ) : quizzes === null ? (
        <p className="card text-sm text-muted-foreground">…</p>
      ) : (
        <>
          {quizzes.length === 0 ? (
            <section className="card">
              <p className="font-semibold">{t("empty")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
            </section>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-accent-700 dark:text-accent-300">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full bg-accent-500"
                />
                {t("openNow")}
              </h2>

              {quizzes.map((quiz) => (
                <QuizCard
                  key={`${quiz.quiz_id}-${quiz.circle_id}`}
                  quiz={quiz}
                  academySlug={academySlug}
                  locale={locale}
                  t={t}
                />
              ))}
            </section>
          )}

          <section className="card p-0">
            <h2 className="px-5 pt-5 text-base font-semibold">{t("results")}</h2>
            {results.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">
                {t("resultsEmpty")}
              </p>
            ) : (
              <ul className="mt-2">
                {results.map((result, at) => (
                  <li
                    key={`${result.quiz_id}-${at}`}
                    className="flex items-center gap-3 border-t border-border-subtle px-5 py-3"
                  >
                    <span className={scoreBadgeClass(result)}>
                      {result.status === "graded" && result.max_score
                        ? t("score", {
                            score: Math.round(
                              ((result.score ?? 0) / result.max_score) * 100,
                            ),
                          })
                        : "؟"}
                    </span>
                    <div className="min-w-0 flex-grow">
                      <p className="truncate text-sm font-semibold">{result.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.circle_name}
                      </p>
                    </div>
                    {result.status === "submitted" && (
                      <span className="shrink-0 text-end text-xs leading-tight text-accent-700 dark:text-accent-300">
                        {t("awaiting")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * One open quiz.
 *
 * Gold, because a quiz with a closing time IS a "happening now" — the same
 * scarce accent the live circles wear, and for the same reason: it is the
 * thing on this screen with a deadline.
 */
function QuizCard({
  quiz,
  academySlug,
  locale,
  t,
}: {
  quiz: MyQuiz;
  academySlug: string;
  locale: string;
  t: ReturnType<typeof useTranslations<"quizzes">>;
}) {
  const exhausted = quiz.attempts_used >= quiz.max_attempts;

  return (
    <article
      className="overflow-hidden rounded-2xl border-2 border-accent-500 bg-surface
                 shadow-[0_2px_10px_rgba(196,145,58,0.14)]"
    >
      <div className="p-4">
        <h3 className="font-display text-lg font-bold">{quiz.title}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {quiz.circle_name} · {quiz.teacher_name}
        </p>

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {quiz.duration_minutes && (
            <span>{t("minutes", { count: quiz.duration_minutes })}</span>
          )}
          <span>{t("questions", { count: quiz.question_count })}</span>
          <span>{t("attempts", { count: quiz.max_attempts })}</span>
          {quiz.closes_at && (
            <span className="text-accent-700 dark:text-accent-300">
              {t("closesAt", {
                date: new Intl.DateTimeFormat(
                  locale === "ar" ? "ar-EG" : "en-GB",
                  { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
                ).format(new Date(quiz.closes_at)),
              })}
            </span>
          )}
        </p>

        {/* The phone is the credential for sitting it, exactly as it is for
            صفحتي — said here so the requirement is not a surprise on the next
            screen. */}
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-100 p-3 text-xs leading-relaxed text-accent-700 dark:bg-accent-700/15 dark:text-accent-300">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {t("identityNote")}
        </p>
      </div>

      <div className="px-4 pb-4">
        {exhausted ? (
          <p className="rounded-xl bg-surface-muted py-3 text-center text-sm font-semibold text-muted-foreground">
            {t("usedUp")}
          </p>
        ) : (
          <Link
            href={`/${academySlug}/circle/${quiz.registration_slug}/quiz/${quiz.quiz_id}`}
            className="btn-primary w-full"
          >
            {quiz.attempts_used > 0 ? t("retake") : t("start")}
          </Link>
        )}
      </div>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-11 rounded-xl text-sm transition-colors focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                    active
                      ? "bg-surface font-bold text-foreground shadow-sm"
                      : "font-semibold text-muted-foreground hover:text-foreground"
                  }`}
    >
      {label}
    </button>
  );
}

/** Green when it is marked, neutral while it waits — never red. */
function scoreBadgeClass(result: MyQuizResult) {
  const base =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold";

  if (result.status === "graded") {
    return `${base} bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100`;
  }
  return `${base} bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300`;
}
