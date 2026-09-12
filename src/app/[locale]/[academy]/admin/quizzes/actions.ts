"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing a quiz is open to any approved معلمة, not only a مشرفة — the person
 * who taught the أحاديث is the one who knows what to ask about them.
 *
 * `quizzes_insert_staff` is what actually allows it; these checks decide what
 * to show and fail early with a message. Editing later is narrower:
 * `quizzes_update_owner` limits it to the author, the owner of the circle it
 * is scoped to, or a مشرفة — so one معلمة cannot rewrite another's paper.
 */

const MAX_TITLE = 200;

type QuizValues = {
  circleType: string;
  curriculumId: string;
  circleId: string;
  title: string;
  instructions: string;
  durationMinutes: string;
  maxAttempts: string;
  passScore: string;
};

export type QuizFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: QuizValues;
      fieldErrors: Partial<Record<"title" | "circleType" | "durationMinutes", string>>;
    }
  | { status: "failed"; values: QuizValues; reason: string };

function readQuiz(formData: FormData): QuizValues {
  return {
    circleType: String(formData.get("circleType") ?? "").trim(),
    curriculumId: String(formData.get("curriculumId") ?? "").trim(),
    circleId: String(formData.get("circleId") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    instructions: String(formData.get("instructions") ?? "").trim(),
    durationMinutes: String(formData.get("durationMinutes") ?? "").trim(),
    maxAttempts: String(formData.get("maxAttempts") ?? "1").trim(),
    passScore: String(formData.get("passScore") ?? "50").trim(),
  };
}

export async function createQuiz(
  _previous: QuizFormState,
  formData: FormData,
): Promise<QuizFormState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const values = readQuiz(formData);

  const fieldErrors: Partial<
    Record<"title" | "circleType" | "durationMinutes", string>
  > = {};
  if (!values.title) fieldErrors.title = "required";
  else if (values.title.length > MAX_TITLE) fieldErrors.title = "tooLong";
  if (!values.circleType) fieldErrors.circleType = "required";

  const duration = values.durationMinutes ? Number(values.durationMinutes) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration < 1 || duration > 480)) {
    fieldErrors.durationMinutes = "range";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  const session = await requireStaffSession(`/${academySlug}/admin/quizzes`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      academy_id: academy.id,
      circle_type: values.circleType,
      // Empty string from a "— all —" option means "not narrowed", not an id.
      curriculum_id: values.curriculumId || null,
      circle_id: values.circleId || null,
      title: values.title,
      instructions: values.instructions || null,
      duration_minutes: duration,
      max_attempts: Number(values.maxAttempts) || 1,
      pass_score: Number(values.passScore) || 50,
      created_by: session.teacher.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("quiz insert failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  revalidatePath(`/${academySlug}/admin/quizzes`);
  // Straight into the question builder: a quiz with no questions is not yet a
  // quiz, and making her find it again in a list is a step for nothing.
  redirect(`/${academySlug}/admin/quizzes/${data.id}`);
}

/**
 * Publishing is the moment students can see it, so it is deliberately its own
 * action rather than a checkbox on the create form — and it refuses a quiz
 * with no questions, which would otherwise appear to students as an empty
 * paper they cannot pass.
 */
export async function setQuizPublished(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const quizId = String(formData.get("quizId") ?? "");
  const publish = formData.get("isPublished") === "1";

  await requireStaffSession(`/${academySlug}/admin/quizzes`);

  const supabase = await createClient();

  if (publish) {
    const { count } = await supabase
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId);

    if (!count) return;
  }

  const { error } = await supabase
    .from("quizzes")
    .update({ is_published: publish })
    .eq("id", quizId);

  if (error) console.error("quiz publish failed", error);

  revalidatePath(`/${academySlug}/admin/quizzes`);
  revalidatePath(`/${academySlug}/admin/quizzes/${quizId}`);
}

/** The author or a مشرفة. Attempts already sat are deleted with it. */
export async function deleteQuiz(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const quizId = String(formData.get("quizId") ?? "");

  const session = await requireStaffSession(`/${academySlug}/admin/quizzes`);

  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("created_by")
    .eq("id", quizId)
    .maybeSingle();

  if (!quiz) return;
  if (!canSupervise(session.teacher) && quiz.created_by !== session.teacher.id) return;

  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
  if (error) console.error("quiz delete failed", error);

  revalidatePath(`/${academySlug}/admin/quizzes`);
}
