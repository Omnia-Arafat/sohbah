"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks one written answer right or wrong.
 *
 * The score and the attempt's status are recomputed inside
 * `grade_written_answer()` rather than here — see that migration for why the
 * three writes have to happen together.
 */
export async function gradeAnswer(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const quizId = String(formData.get("quizId") ?? "");
  const attemptId = String(formData.get("attemptId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const isCorrect = formData.get("isCorrect") === "1";

  await requireStaffSession(`/${academySlug}/admin/quizzes/${quizId}/results`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("grade_written_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_is_correct: isCorrect,
    p_points: null,
  });

  if (error) console.error("grade_written_answer failed", error);

  revalidatePath(`/${academySlug}/admin/quizzes/${quizId}/results`);
}
