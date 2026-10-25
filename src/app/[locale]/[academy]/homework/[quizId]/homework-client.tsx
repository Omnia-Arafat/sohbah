"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HomeworkCheck, HomeworkPaperRow } from "@/lib/database.types";
import { setMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";
import { useMe } from "@/lib/use-my-record";
import { staffAsStudent } from "../../quizzes/actions";

type Question = {
  id: string;
  kind: HomeworkPaperRow["kind"];
  prompt: string;
  options: { id: string; text: string }[];
};

type Answer = {
  chosen: string[];
  text: string;
  check: HomeworkCheck | null;
};

const EMPTY: Answer = { chosen: [], text: "", check: null };

function foldQuestions(rows: HomeworkPaperRow[]): Question[] {
  const byId = new Map<string, Question>();
  for (const row of rows) {
    let question = byId.get(row.question_id);
    if (!question) {
      question = { id: row.question_id, kind: row.kind, prompt: row.prompt, options: [] };
      byId.set(row.question_id, question);
    }
    if (row.option_id) question.options.push({ id: row.option_id, text: row.option_text ?? "" });
  }
  return [...byId.values()];
}

/**
 * A واجب: no clock, no attempts, no score. She answers, checks, and is shown
 * right or wrong with the correct answer; she can try a question again.
 * A check records only that she looked at that question — never her answer or
 * whether it was right — so her معلمة can see who did the واجب.
 */
export function HomeworkClient({
  academySlug,
  quizId,
  isStaff,
}: {
  academySlug: string;
  quizId: string;
  isStaff: boolean;
}) {
  const t = useTranslations("homework");
  const supabase = useMemo(() => createClient(), []);
  const { key, me } = useMe(academySlug);

  const [staffTried, setStaffTried] = useState(false);
  useEffect(() => {
    if (me || !isStaff || staffTried) return;
    let cancelled = false;
    staffAsStudent().then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) setMe(key, outcome.me);
      setStaffTried(true);
    });
    return () => {
      cancelled = true;
    };
  }, [me, isStaff, staffTried, key]);

  const [paper, setPaper] = useState<{
    for: string;
    title: string;
    instructions: string | null;
    questions: Question[];
    error: string | null;
  } | null>(null);
  const forKey = me ? `${me.studentId}:${quizId}` : null;

  useEffect(() => {
    if (!me || !forKey) return;
    let cancelled = false;
    supabase
      .rpc("homework_paper", { p_quiz_id: quizId, p_student_id: me.studentId, p_phone: me.phone })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("homework_paper failed", error);
        const rows = (data ?? []) as HomeworkPaperRow[];
        setPaper({
          for: forKey,
          title: rows[0]?.quiz_title ?? "",
          instructions: rows[0]?.instructions ?? null,
          questions: foldQuestions(rows),
          error: error ? (error.message.includes("phone_mismatch") ? "signIn" : "notFound") : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, me, quizId, forKey]);

  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [checking, setChecking] = useState(false);

  if (!me) {
    if (isStaff && !staffTried) return <p className="card text-sm text-muted-foreground">…</p>;
    return <SignInPrompt academySlug={academySlug} t={t} />;
  }

  if (!paper || paper.for !== forKey) {
    return <p className="card text-sm text-muted-foreground">…</p>;
  }

  if (paper.error === "signIn") return <SignInPrompt academySlug={academySlug} t={t} />;

  if (paper.error || paper.questions.length === 0) {
    return (
      <section className="card">
        <p className="font-semibold">{t("notFound")}</p>
      </section>
    );
  }

  const questions = paper.questions;
  const question = questions[Math.min(at, questions.length - 1)];
  const answer = answers[question.id] ?? EMPTY;
  const checked = answer.check !== null;
  const choiceKind = question.kind === "mcq" || question.kind === "multi" || question.kind === "true_false";
  const canCheck = choiceKind ? answer.chosen.length > 0 : answer.text.trim().length > 0;
  const doneCount = questions.filter((q) => answers[q.id]?.check).length;

  function update(next: Partial<Answer>) {
    setAnswers((prev) => ({ ...prev, [question.id]: { ...(prev[question.id] ?? EMPTY), ...next } }));
  }

  function choose(optionId: string) {
    if (checked) return;
    const chosen =
      question.kind === "multi"
        ? answer.chosen.includes(optionId)
          ? answer.chosen.filter((id) => id !== optionId)
          : [...answer.chosen, optionId]
        : [optionId];
    update({ chosen });
  }

  async function check() {
    if (!me || !canCheck) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("check_homework_answer", {
      p_question_id: question.id,
      p_student_id: me.studentId,
      p_phone: me.phone,
      p_option_ids: choiceKind ? answer.chosen : null,
      p_text: choiceKind ? null : answer.text.trim(),
    });
    setChecking(false);
    if (error || !data?.[0]) {
      console.error("check_homework_answer failed", error);
      return;
    }
    update({ check: data[0] as HomeworkCheck });
  }

  const correctIds = new Set(answer.check?.correct_option_ids ?? []);

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h1 className="font-display text-2xl font-bold">{paper.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        {paper.instructions && (
          <p className="mt-2 text-sm text-muted-foreground">{paper.instructions}</p>
        )}
      </section>

      <nav aria-label={t("questionsNav")} className="flex flex-wrap gap-1.5">
        {questions.map((q, index) => {
          const verdict = answers[q.id]?.check?.is_correct;
          const isCurrent = q.id === question.id;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setAt(index)}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-bold transition-colors ${
                verdict === true
                  ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                  : verdict === false
                    ? "bg-absent/10 text-absent"
                    : answers[q.id]?.check
                      ? "bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300"
                      : "bg-surface-muted text-muted-foreground"
              } ${isCurrent ? "ring-2 ring-brand-600 ring-offset-2 ring-offset-background" : ""}`}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      <section
        className={`card border-s-4 ${
          answer.check?.is_correct === true
            ? "border-s-brand-600"
            : answer.check?.is_correct === false
              ? "border-s-absent"
              : checked
                ? "border-s-accent-500"
                : "border-s-transparent"
        }`}
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 font-medium leading-relaxed">
            {at + 1}. {question.prompt}
          </p>
          {checked && <Verdict check={answer.check!} t={t} />}
        </div>

        {choiceKind ? (
          <ul className="mt-3 flex flex-col gap-2">
            {question.options.map((option) => {
              const chosen = answer.chosen.includes(option.id);
              const isKey = checked && correctIds.has(option.id);
              const isWrongPick = checked && chosen && !isKey;
              return (
                <li key={option.id}>
                  <label
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      checked ? "cursor-default" : "cursor-pointer"
                    } ${
                      isKey
                        ? "border-brand-600 bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                        : isWrongPick
                          ? "border-absent bg-absent/10 text-absent"
                          : chosen
                            ? "border-brand-600 bg-brand-50 dark:bg-surface"
                            : "border-border hover:border-brand-400"
                    }`}
                  >
                    <input
                      type={question.kind === "multi" ? "checkbox" : "radio"}
                      name={`q-${question.id}`}
                      checked={chosen}
                      disabled={checked}
                      onChange={() => choose(option.id)}
                      className="h-5 w-5 shrink-0"
                    />
                    <span className="flex-1">{option.text}</span>
                    {isKey && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
                    {isWrongPick && <X aria-hidden="true" className="h-4 w-4 shrink-0" />}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <textarea
              rows={question.kind === "short_text" ? 4 : 1}
              dir="rtl"
              className="input mt-3"
              value={answer.text}
              disabled={checked}
              onChange={(event) => update({ text: event.target.value })}
              placeholder={t("answerPlaceholder")}
            />
            {checked && answer.check!.is_correct !== true && answer.check!.correct_text && (
              <p className="mt-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
                {question.kind === "short_text" ? t("modelAnswer") : t("correctAnswer")}:{" "}
                {answer.check!.correct_text}
              </p>
            )}
            {checked && answer.check!.is_correct === null && !answer.check!.correct_text && (
              <p className="mt-2 text-sm text-muted-foreground">{t("noAutoCheck")}</p>
            )}
          </>
        )}

        <div className="mt-4">
          {checked ? (
            <button
              type="button"
              onClick={() => update({ check: null, chosen: [], text: "" })}
              className="btn-secondary w-full sm:w-auto"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {t("tryAgain")}
            </button>
          ) : (
            <button
              type="button"
              onClick={check}
              disabled={!canCheck || checking}
              className="btn-primary w-full sm:w-auto"
            >
              {checking ? t("checking") : t("check")}
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAt((n) => Math.max(0, n - 1))}
          disabled={at === 0}
          className="btn-secondary min-h-11 px-4 text-sm disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
          {t("previous")}
        </button>
        <span className="text-sm text-muted-foreground">
          {t("progress", { done: doneCount, total: questions.length })}
        </span>
        <button
          type="button"
          onClick={() => setAt((n) => Math.min(questions.length - 1, n + 1))}
          disabled={at >= questions.length - 1}
          className="btn-secondary min-h-11 px-4 text-sm disabled:opacity-40"
        >
          {t("next")}
          <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
        </button>
      </div>

      {doneCount === questions.length && (
        <section className="card flex flex-col gap-3 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <p className="font-semibold">{t("finished")}</p>
          <button
            type="button"
            onClick={() => {
              setAnswers({});
              setAt(0);
            }}
            className="btn-secondary w-full sm:w-auto"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {t("restart")}
          </button>
        </section>
      )}
    </div>
  );
}

function Verdict({
  check,
  t,
}: {
  check: HomeworkCheck;
  t: ReturnType<typeof useTranslations<"homework">>;
}) {
  if (check.is_correct === true) {
    return (
      <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
        {t("right")}
      </span>
    );
  }
  if (check.is_correct === false) {
    return (
      <span className="shrink-0 rounded-full bg-absent/10 px-2.5 py-0.5 text-xs font-bold text-absent">
        {t("wrong")}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-bold text-accent-700 dark:bg-accent-700/20 dark:text-accent-300">
      {t("compare")}
    </span>
  );
}

function SignInPrompt({
  academySlug,
  t,
}: {
  academySlug: string;
  t: ReturnType<typeof useTranslations<"homework">>;
}) {
  return (
    <section className="card">
      <p className="text-sm leading-relaxed text-muted-foreground">{t("signInPrompt")}</p>
      <Link href={`/${academySlug}`} className="btn-primary mt-3 w-full">
        {t("signInCta")}
      </Link>
    </section>
  );
}
