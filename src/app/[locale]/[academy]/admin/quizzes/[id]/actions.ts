"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { QuestionKind } from "@/lib/database.types";

const KINDS: QuestionKind[] = ["mcq", "multi", "true_false", "short_text", "fill_blank"];

export type QuestionFormState =
  | { status: "idle" }
  | { status: "invalid"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Adds one question and its options in a single submit.
 *
 * Options arrive as parallel `optionText[]` / `optionCorrect[]` fields. That
 * shape is what lets the whole question be one HTML form that works before any
 * JavaScript has loaded — the same reason the rest of this app builds forms
 * the way it does.
 *
 * The four choice kinds and the two typed kinds diverge here:
 *   * mcq / multi / true_false — options with at least one marked correct.
 *   * fill_blank — the "options" are accepted spellings of the answer; each is
 *     stored with is_correct = true and compared after `normalize_ar`.
 *   * short_text — no options at all; a معلمة marks it by hand.
 */
export async function addQuestion(
  _previous: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const quizId = String(formData.get("quizId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as QuestionKind;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const points = Number(String(formData.get("points") ?? "1")) || 1;

  if (!prompt) return { status: "invalid", reason: "promptRequired" };
  if (!KINDS.includes(kind)) return { status: "invalid", reason: "generic" };

  const texts = formData.getAll("optionText").map((value) => String(value).trim());
  // Checkbox values carry the row index, since unchecked boxes are not posted
  // at all and positional alignment would otherwise be lost.
  const correct = new Set(formData.getAll("optionCorrect").map((v) => String(v)));

  const options = texts
    .map((text, index) => ({ text, index }))
    .filter((option) => option.text.length > 0);

  const needsOptions = kind === "mcq" || kind === "multi" || kind === "true_false";

  if (needsOptions) {
    if (options.length < 2) return { status: "invalid", reason: "needTwoOptions" };
    if (!options.some((option) => correct.has(String(option.index)))) {
      return { status: "invalid", reason: "needCorrect" };
    }
    // A single-answer question with several correct options would be graded by
    // set equality and become unanswerable in the UI, which offers one radio.
    if (kind !== "multi") {
      const correctCount = options.filter((o) => correct.has(String(o.index))).length;
      if (correctCount > 1) return { status: "invalid", reason: "onlyOneCorrect" };
    }
  }

  if (kind === "fill_blank" && options.length === 0) {
    return { status: "invalid", reason: "needAnswer" };
  }

  await requireStaffSession(`/${academySlug}/admin/quizzes/${quizId}`);

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("quiz_questions")
    .select("position")
    .eq("quiz_id", quizId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: question, error } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_id: quizId,
      unit_id: unitId || null,
      position: (last?.position ?? 0) + 1,
      kind,
      prompt,
      points,
    })
    .select("id")
    .single();

  if (error || !question) {
    console.error("question insert failed", error);
    return { status: "failed", reason: "generic" };
  }

  if (options.length > 0) {
    const rows = options.map((option, index) => ({
      question_id: question.id,
      position: index + 1,
      text: option.text,
      // Every accepted spelling of a fill-in answer is "correct" by definition.
      is_correct: kind === "fill_blank" || correct.has(String(option.index)),
    }));

    const { error: optionError } = await supabase.from("quiz_options").insert(rows);

    if (optionError) {
      console.error("options insert failed", optionError);
      // Leaving a question with no options would be worse than no question:
      // it would be unanswerable and ungradeable. Roll it back by hand, since
      // two client calls are not one transaction.
      await supabase.from("quiz_questions").delete().eq("id", question.id);
      return { status: "failed", reason: "generic" };
    }
  }

  revalidatePath(`/${academySlug}/admin/quizzes/${quizId}`);
  return { status: "idle" };
}

export async function deleteQuestion(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const quizId = String(formData.get("quizId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");

  await requireStaffSession(`/${academySlug}/admin/quizzes/${quizId}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("id", questionId)
    .eq("quiz_id", quizId);

  if (error) console.error("question delete failed", error);

  revalidatePath(`/${academySlug}/admin/quizzes/${quizId}`);
}
