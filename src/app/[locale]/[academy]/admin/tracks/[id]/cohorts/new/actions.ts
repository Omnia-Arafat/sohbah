"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";

export type CohortFormState = { error: string | null };

/**
 * Create a cohort of a track.
 *
 * The RLS policy on track_cohorts is the real guard — this re-checks the role
 * here only so a مشرفة sees a sentence rather than a database error, and so a
 * request that should never have been made does not reach the table at all.
 */
export async function createCohort(
  _prev: CohortFormState,
  formData: FormData,
): Promise<CohortFormState> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");
  const maxStudentsRaw = String(formData.get("maxStudents") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return { error: "notAuthorized" };
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { error: "notFound" };

  if (name === "") return { error: "nameRequired" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "startRequired" };

  const maxStudents = maxStudentsRaw === "" ? null : Number(maxStudentsRaw);
  if (maxStudents !== null && (!Number.isInteger(maxStudents) || maxStudents < 1)) {
    return { error: "capacityInvalid" };
  }
  if (!["draft", "registering", "running"].includes(status)) {
    return { error: "statusInvalid" };
  }

  const supabase = await createClient();

  // `Database` predates these tables; see src/lib/tracks-dal.ts.
  const { error } = await supabase.from("track_cohorts" as never).insert({
    track_id: trackId,
    academy_id: academy.id,
    name_ar: name,
    teacher_id: teacherId === "" ? null : teacherId,
    start_date: startDate,
    max_students: maxStudents,
    status,
  } as never);

  if (error) {
    console.error("createCohort failed", error);
    return { error: "saveFailed" };
  }

  revalidatePath(`/${academySlug}/admin/tracks/${trackId}`);
  revalidatePath(`/${academySlug}/admin/tracks`);
  revalidatePath(`/${academySlug}/admin`);
  redirect(`/${academySlug}/admin/tracks/${trackId}`);
}
