"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type {
  QuizForStudentRow,
  StudentSearchResult,
  SubmitAttemptRow,
} from "@/lib/database.types";
import { loadPaper, saveAnswer, submitAttempt } from "./actions";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** One question, with its options folded back together from the flat rows. */
type Question = {
  id: string;
  kind: QuizForStudentRow["kind"];
  prompt: string;
  points: number;
  options: { id: string; text: string }[];
  chosen: string[];
  text: string;
};

function foldQuestions(rows: QuizForStudentRow[]): Question[] {
  const byId = new Map<string, Question>();
  // The rows arrive in the order the function chose — shuffled per attempt, or
  // by position — so insertion order is the paper's order. Preserve it.
  for (const row of rows) {
    let question = byId.get(row.question_id);
    if (!question) {
      question = {
        id: row.question_id,
        kind: row.kind,
        prompt: row.prompt,
        points: Number(row.points),
        options: [],
        chosen: [],
        text: row.text_answer ?? "",
      };
      byId.set(row.question_id, question);
    }
    if (row.option_id) {
      question.options.push({ id: row.option_id, text: row.option_text ?? "" });
      if (row.chosen) question.chosen.push(row.option_id);
    }
  }
  return [...byId.values()];
}

export function QuizClient({
  slug,
  quizId,
  title,
  instructions,
  startAction,
}: {
  slug: string;
  quizId: string;
  title: string;
  instructions: string | null;
  startAction: (formData: FormData) => Promise<
    | { status: "started"; attemptId: string; expiresAt: string | null }
    | { status: "error"; reason: string }
  >;
}) {
  const t = useTranslations("quiz");
  const supabase = useMemo(() => createClient(), []);

  // --- identity gate --------------------------------------------------------
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StudentSearchResult[] | null>(null);
  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [phone, setPhone] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const trimmed = query.trim();

  useEffect(() => {
    if (student || trimmed.length < MIN_QUERY) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_students", {
        p_slug: slug,
        p_query: trimmed,
      });
      if (cancelled) return;
      if (error) {
        setGateError("generic");
        return;
      }
      setMatches(data ?? []);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, supabase, slug, student]);

  // --- the paper ------------------------------------------------------------
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<SubmitAttemptRow | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The countdown is display only. `save_quiz_answer` and
  // `submit_quiz_attempt` both re-check the deadline against the server clock,
  // so changing the device time buys nothing.
  useEffect(() => {
    if (!expiresAt || result) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, result]);

  const remainingMs = expiresAt ? new Date(expiresAt).getTime() - now : null;

  async function handleStart(formData: FormData) {
    setStarting(true);
    setGateError(null);
    const outcome = await startAction(formData);
    setStarting(false);

    if (outcome.status === "error") {
      setGateError(outcome.reason);
      return;
    }

    setAttemptId(outcome.attemptId);
    setExpiresAt(outcome.expiresAt);
    setQuestions(foldQuestions(await loadPaper(outcome.attemptId)));
  }

  /**
   * Saves one answer as soon as it changes. Local state updates first so the
   * radio never lags behind the tap; the round trip is what makes a closed tab
   * survivable, not what makes the UI respond.
   */
  const persist = useCallback(
    async (question: Question, chosen: string[], text: string) => {
      if (!attemptId) return;
      const outcome = await saveAnswer(
        attemptId,
        question.id,
        chosen.length > 0 ? chosen : null,
        text || null,
      );
      if (!outcome.ok) setSaveError(outcome.reason ?? "generic");
    },
    [attemptId],
  );

  const textTimers = useRef<Record<string, number>>({});

  function choose(question: Question, optionId: string) {
    const chosen =
      question.kind === "multi"
        ? question.chosen.includes(optionId)
          ? question.chosen.filter((id) => id !== optionId)
          : [...question.chosen, optionId]
        : [optionId];

    setQuestions((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, chosen } : q)),
    );
    persist(question, chosen, question.text);
  }

  function type(question: Question, value: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === question.id ? { ...q, text: value } : q)),
    );
    // Debounced: one save per pause, not one per keystroke.
    window.clearTimeout(textTimers.current[question.id]);
    textTimers.current[question.id] = window.setTimeout(() => {
      persist(question, question.chosen, value);
    }, 600);
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setSubmitting(true);
    const outcome = await submitAttempt(attemptId);
    setSubmitting(false);
    if (outcome) setResult(outcome);
  }

  // --- result ---------------------------------------------------------------
  if (result) {
    const hidden = result.show_results === "never";
    const pct =
      Number(result.max_score) > 0
        ? Math.round((Number(result.auto_score) / Number(result.max_score)) * 100)
        : 0;
    const passed = pct >= Number(result.pass_score);

    return (
      <section className="card">
        <h2 className="font-display text-xl font-bold">{t("done.title")}</h2>

        {hidden ? (
          <p className="mt-2 text-muted-foreground">{t("done.hidden")}</p>
        ) : (
          <>
            <p className="mt-3 text-3xl font-bold">
              {Number(result.auto_score)} / {Number(result.max_score)}
            </p>
            <p
              className={`mt-1 font-medium ${
                passed
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-accent-700 dark:text-accent-300"
              }`}
            >
              {passed ? t("done.passed", { pct: String(pct) }) : t("done.failed", { pct: String(pct) })}
            </p>
            {Number(result.pending_count) > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("done.pending", { count: String(result.pending_count) })}
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  // --- the gate -------------------------------------------------------------
  if (!attemptId) {
    return (
      <form action={handleStart} className="card flex flex-col gap-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="quizId" value={quizId} />
        <input type="hidden" name="studentId" value={student?.id ?? ""} />

        <div>
          <h2 className="text-lg font-semibold">{t("gate.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("gate.hint")}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="q">
            {t("gate.name")}
          </label>
          {student ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3">
              <span className="font-medium">
                {student.name} {student.father_name}
              </span>
              <button
                type="button"
                className="text-sm font-medium text-brand-700 underline dark:text-brand-300"
                onClick={() => {
                  setStudent(null);
                  setQuery("");
                  setMatches(null);
                }}
              >
                {t("gate.change")}
              </button>
            </div>
          ) : (
            <>
              <input
                id="q"
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("gate.namePlaceholder")}
                autoComplete="off"
              />
              {matches && matches.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {matches.map((match) => (
                    <li key={match.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-border px-4 py-2 text-start hover:border-brand-600"
                        onClick={() => setStudent(match)}
                      >
                        {match.name} {match.father_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {matches && matches.length === 0 && trimmed.length >= MIN_QUERY && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("gate.noMatch")}
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="phone">
            {t("gate.phone")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            className="input text-start"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("gate.phonePlaceholder")}
          />
          <p className="mt-1.5 text-sm text-muted-foreground">{t("gate.phoneHint")}</p>
        </div>

        {gateError && <p className="text-sm text-absent">{t(`errors.${gateError}`)}</p>}

        <button
          type="submit"
          className="btn-primary w-full sm:w-auto"
          disabled={starting || !student || !phone.trim()}
        >
          {starting ? t("gate.starting") : t("gate.start")}
        </button>
      </form>
    );
  }

  // --- the paper ------------------------------------------------------------
  const answered = questions.filter(
    (question) => question.chosen.length > 0 || question.text.trim().length > 0,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("progress", {
              answered: String(answered),
              total: String(questions.length),
            })}
          </span>
          {remainingMs !== null && (
            <span
              className={
                remainingMs < 60_000
                  ? "font-bold text-absent"
                  : "font-medium text-muted-foreground"
              }
              dir="ltr"
            >
              {remainingMs > 0
                ? `${Math.floor(remainingMs / 60000)}:${String(
                    Math.floor((remainingMs % 60000) / 1000),
                  ).padStart(2, "0")}`
                : t("timeUp")}
            </span>
          )}
        </div>
      </div>

      {instructions && (
        <p className="card text-sm text-muted-foreground">{instructions}</p>
      )}

      {questions.map((question, index) => (
        <section key={question.id} className="card">
          <p className="font-medium">
            {index + 1}. {question.prompt}
          </p>

          {question.options.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {question.options.map((option) => {
                const checked = question.chosen.includes(option.id);
                return (
                  <li key={option.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        checked
                          ? "border-brand-600 bg-brand-50 dark:bg-surface"
                          : "border-border hover:border-brand-400"
                      }`}
                    >
                      <input
                        type={question.kind === "multi" ? "checkbox" : "radio"}
                        name={`q-${question.id}`}
                        checked={checked}
                        onChange={() => choose(question, option.id)}
                        className="h-5 w-5 shrink-0"
                      />
                      <span>{option.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <textarea
              rows={question.kind === "short_text" ? 4 : 1}
              dir="rtl"
              className="input mt-3"
              value={question.text}
              onChange={(event) => type(question, event.target.value)}
              placeholder={t("answerPlaceholder")}
            />
          )}
        </section>
      ))}

      {saveError && <p className="text-sm text-absent">{t(`errors.${saveError}`)}</p>}

      <button
        type="button"
        className="btn-primary"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("submit")}
      </button>
    </div>
  );
}
