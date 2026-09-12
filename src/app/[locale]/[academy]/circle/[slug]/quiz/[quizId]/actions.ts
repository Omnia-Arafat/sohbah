"use server";

import { createClient } from "@/lib/supabase/server";
import type { QuizForStudentRow, SubmitAttemptRow } from "@/lib/database.types";

/**
 * The student's side of the quiz. Every one of these is a thin wrapper over a
 * SECURITY DEFINER function — the rules they enforce (identity, the clock, the
 * attempt limit, which quiz belongs to which circle) live in the database, not
 * here, because a student is anonymous and there is no session to trust.
 *
 * These run on the server rather than from the browser so the `attempt_id`
 * never has to be a thing the page holds in a URL, and so a failure comes back
 * as a message rather than a raw Postgres error.
 */

/** Known refusals from `start_quiz_attempt`, each worth its own message. */
const START_ERRORS = new Set([
  "phone_mismatch",
  "phone_missing",
  "no_attempts_left",
  "quiz_closed",
  "student_not_in_circle",
  "quiz_not_for_this_circle",
]);

export type StartState =
  | { status: "idle" }
  | { status: "started"; attemptId: string; expiresAt: string | null }
  | { status: "error"; reason: string };

export async function startAttempt(
  _previous: StartState,
  formData: FormData,
): Promise<StartState> {
  const slug = String(formData.get("slug") ?? "");
  const quizId = String(formData.get("quizId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();

  if (!studentId) return { status: "error", reason: "pickName" };
  if (!phone) return { status: "error", reason: "phoneRequired" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_quiz_attempt", {
    p_slug: slug,
    p_quiz_id: quizId,
    p_student_id: studentId,
    p_phone: phone,
  });

  if (error) {
    // The function raises named exceptions; surface the ones a student can act
    // on and hide the rest behind a generic message.
    const known = [...START_ERRORS].find((code) => error.message.includes(code));
    if (!known) console.error("start_quiz_attempt failed", error);
    return { status: "error", reason: known ?? "generic" };
  }

  const row = data?.[0];
  if (!row) return { status: "error", reason: "generic" };

  return { status: "started", attemptId: row.attempt_id, expiresAt: row.expires_at };
}

export async function loadPaper(attemptId: string): Promise<QuizForStudentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_for_student", {
    p_attempt_id: attemptId,
  });

  if (error) {
    console.error("quiz_for_student failed", error);
    return [];
  }
  return data ?? [];
}

/**
 * Autosave. Deliberately fire-and-forget from the caller's point of view: a
 * dropped save is retried by the next one, and the submit re-reads whatever
 * actually landed. What must not happen is a lost connection costing her the
 * answers she already typed.
 */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  optionIds: string[] | null,
  text: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_quiz_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_option_ids: optionIds,
    p_text: text,
  });

  if (error) {
    if (error.message.includes("time_up")) return { ok: false, reason: "timeUp" };
    if (error.message.includes("quiz_closed")) return { ok: false, reason: "closed" };
    console.error("save_quiz_answer failed", error);
    return { ok: false, reason: "generic" };
  }
  return { ok: true };
}

export async function submitAttempt(
  attemptId: string,
): Promise<SubmitAttemptRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_quiz_attempt", {
    p_attempt_id: attemptId,
  });

  if (error) {
    console.error("submit_quiz_attempt failed", error);
    return null;
  }
  return data?.[0] ?? null;
}
