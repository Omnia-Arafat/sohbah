"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";

export type EditCohortState = { error: string | null };

/**
 * Change a cohort after it exists.
 *
 * WHY THIS IS NOT A NICE-TO-HAVE.
 *
 * `start_date` is not decoration: the week number and which day is "اليوم
 * الأول" are both computed from it. A cohort entered with the wrong weekday
 * shows every student the wrong day's assignment, every day, and before this
 * screen existed the only way to correct it was to open the database by
 * hand — during a data-entry exercise where getting the day wrong is the
 * single easiest mistake to make.
 */
export async function updateCohort(
  _prev: EditCohortState,
  formData: FormData,
): Promise<EditCohortState> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const cohortId = String(formData.get("cohortId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");
  const maxStudentsRaw = String(formData.get("maxStudents") ?? "").trim();
  const status = String(formData.get("status") ?? "");

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
  if (!["draft", "registering", "running", "paused", "finished"].includes(status)) {
    return { error: "statusInvalid" };
  }

  const supabase = await createClient();

  // Scoped by academy as well as id: an id from another academy is not this
  // admin's to edit, and the policy would refuse it anyway.
  const { error } = await supabase
    .from("track_cohorts" as never)
    .update({
      name_ar: name,
      teacher_id: teacherId === "" ? null : teacherId,
      start_date: startDate,
      max_students: maxStudents,
      status,
    } as never)
    .eq("id" as never, cohortId as never)
    .eq("academy_id" as never, academy.id as never);

  if (error) {
    console.error("updateCohort failed", error);
    return { error: "saveFailed" };
  }

  revalidatePath(`/${academySlug}/admin/tracks/${trackId}/cohorts/${cohortId}`);
  revalidatePath(`/${academySlug}/admin/tracks/${trackId}`);
  revalidatePath(`/${academySlug}/admin/tracks`);
  revalidatePath(`/${academySlug}/admin`);
  redirect(`/${academySlug}/admin/tracks/${trackId}/cohorts/${cohortId}`);
}
