"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Share2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { QuizReviewRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type ReviewQuestion = {
  id: string;
  position: number;
  kind: QuizReviewRow["kind"];
  prompt: string;
  points: number;
  correct: boolean | null;
  awarded: number | null;
  textAnswer: string | null;
  options: { id: string; text: string; chosen: boolean; correct: boolean | null }[];
};

function fold(rows: QuizReviewRow[]): ReviewQuestion[] {
  const byId = new Map<string, ReviewQuestion>();
  for (const row of rows) {
    let question = byId.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        position: row.question_position,
        kind: row.kind,
        prompt: row.prompt,
        points: Number(row.points),
        correct: row.answer_correct,
        awarded: row.awarded_points === null ? null : Number(row.awarded_points),
        textAnswer: row.text_answer,
        options: [],
      };
      byId.set(row.question_id, question);
    }
    if (row.option_id) {
      question.options.push({
        id: row.option_id,
        text: row.option_text ?? "",
        chosen: row.chosen,
        correct: row.option_correct,
      });
    }
  }
  return [...byId.values()];
}

/**
 * The score, a way to share it, and every question marked right or wrong.
 *
 * Which option was correct shows only when `key_revealed` — once she has no
 * attempt left to use it on. Before that she still sees her own answers marked.
 */
export function ResultClient({ attemptId }: { attemptId: string }) {
  const t = useTranslations("quizResult");
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<QuizReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("quiz_attempt_review", {
        p_attempt_id: attemptId,
      });
      if (cancelled) return;
      if (rpcError) {
        const known = ["results_hidden", "results_not_yet"].find((code) =>
          rpcError.message.includes(code),
        );
        setError(known ?? "notFound");
        return;
      }
      if (!data?.length) {
        setError("notFound");
        return;
      }
      setRows(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, attemptId]);

  if (error) {
    return <p className="card text-muted-foreground">{t(`errors.${error}`)}</p>;
  }
  if (!rows) {
    return <p className="card text-sm text-muted-foreground">…</p>;
  }

  const head = rows[0];
  // The SQL joins name and father_name; the register form writes "-" for the
  // latter (see student-name.ts), which must not trail every name.
  const studentName = head.student_name.replace(/\s+-$/, "");
  const questions = fold(rows);
  const score = Number(head.auto_score ?? 0) + Number(head.manual_score ?? 0);
  const max = Number(head.max_score ?? 0);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const passed = pct >= Number(head.pass_score);
  const pending = questions.filter((q) => q.kind === "short_text" && q.correct === null && q.textAnswer).length;
  const rightCount = questions.filter((q) => q.correct === true).length;

  async function share() {
    const text = t("shareText", {
      name: studentName,
      title: head.quiz_title,
      score: String(score),
      max: String(max),
      pct: String(pct),
    });
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // She closed the sheet: nothing to report.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused; the score is on screen either way.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">{studentName}</p>
        <h1 className="font-display text-xl font-bold">{head.quiz_title}</h1>
        <p dir="ltr" className="mt-3 text-4xl font-bold">
          {score} / {max}
        </p>
        <p
          className={`font-semibold ${
            passed ? "text-brand-700 dark:text-brand-300" : "text-accent-700 dark:text-accent-300"
          }`}
        >
          {passed ? t("passed", { pct: String(pct) }) : t("notPassed", { pct: String(pct) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("rightOf", { right: String(rightCount), total: String(questions.length) })}
        </p>
        {pending > 0 && (
          <p className="mt-1 text-sm text-accent-700 dark:text-accent-300">
            {t("pending", { count: String(pending) })}
          </p>
        )}
        <button type="button" onClick={share} className="btn-primary mt-4 w-full sm:w-auto">
          <Share2 aria-hidden="true" className="h-5 w-5" />
          {copied ? t("copied") : t("share")}
        </button>
      </section>

      {!head.key_revealed && (
        <p className="rounded-xl bg-accent-100 p-3 text-sm leading-relaxed text-accent-700 dark:bg-accent-700/15 dark:text-accent-300">
          {t("keyHidden")}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {questions.map((question, at) => (
          <li
            key={question.id}
            className={`card border-s-4 ${
              question.correct === true
                ? "border-s-brand-600"
                : question.correct === false || (question.correct === null && question.kind !== "short_text")
                  ? "border-s-absent"
                  : "border-s-accent-500"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-bold">
                {at + 1}
              </span>
              <p className="flex-1 font-medium leading-relaxed">{question.prompt}</p>
              <Verdict question={question} t={t} />
            </div>

            {question.options.length > 0 && question.kind !== "fill_blank" ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {question.options.map((option) => (
                  <li
                    key={option.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      option.correct
                        ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                        : option.chosen
                          ? "bg-absent/10 text-absent"
                          : "text-muted-foreground"
                    }`}
                  >
                    {option.correct ? (
                      <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
                    ) : option.chosen ? (
                      <X aria-hidden="true" className="h-4 w-4 shrink-0" />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{option.text}</span>
                    {option.chosen && (
                      <span className="shrink-0 text-xs font-semibold">{t("yourAnswer")}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("yourAnswer")}: </span>
                  {question.textAnswer?.trim() ? question.textAnswer : t("noAnswer")}
                </p>
                {question.kind === "fill_blank" && head.key_revealed && question.correct !== true && (
                  <p className="font-semibold text-brand-700 dark:text-brand-300">
                    {t("correctAnswer")}: {question.options.map((o) => o.text).join(" / ")}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Verdict({
  question,
  t,
}: {
  question: ReviewQuestion;
  t: ReturnType<typeof useTranslations<"quizResult">>;
}) {
  const unanswered =
    question.correct === null &&
    !question.options.some((o) => o.chosen) &&
    !question.textAnswer?.trim();

  if (question.correct === true) {
    return (
      <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
        {t("right")}
      </span>
    );
  }
  if (question.correct === false || (unanswered && question.kind !== "short_text")) {
    return (
      <span className="shrink-0 rounded-full bg-absent/10 px-2.5 py-0.5 text-xs font-bold text-absent">
        {unanswered ? t("unanswered") : t("wrong")}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-bold text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
      {unanswered ? t("unanswered") : t("awaiting")}
    </span>
  );
}
