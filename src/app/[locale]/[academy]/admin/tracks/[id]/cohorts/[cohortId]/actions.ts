"use server";

import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";

export type RosterState = { error: string | null; added: number };

/**
 * Put existing students straight onto a running cohort.
 *
 * THIS IS THE MIGRATION PATH, NOT THE EVERYDAY ONE.
 *
 * Normally a student applies and a مشرفة accepts, which is what
 * `approve_track_enrollment()` is for — it takes a seat under a per-cohort
 * lock. But the academy's tracks have been running for months on paper, and
 * making twenty existing students each file an application so someone can
 * approve twenty applications would be ceremony, not safety.
 *
 * So these go in as `active` directly. The two rules that actually matter are
 * still enforced by the database and cannot be bypassed here: the unique
 * index allows a student only one track, and the capacity check below refuses
 * to overfill. A row that breaks either simply fails to insert.
 */
export async function addStudents(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const cohortId = String(formData.get("cohortId") ?? "");
  const studentIds = formData.getAll("studentIds").map(String).filter(Boolean);

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return { error: "notAuthorized", added: 0 };
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { error: "notFound", added: 0 };
  if (studentIds.length === 0) return { error: "noneChosen", added: 0 };

  const supabase = await createClient();

  // Capacity, read fresh: the seat count is the one number two people can
  // race on, and refusing here is friendlier than a constraint error.
  const { data: cohortRow, error: cohortError } = await supabase
    .from("track_cohorts" as never)
    .select("max_students, track_enrollments(status)")
    .eq("id" as never, cohortId as never)
    .eq("academy_id" as never, academy.id as never)
    .maybeSingle();

  if (cohortError || !cohortRow) {
    console.error("addStudents (cohort) failed", cohortError);
    return { error: "notFound", added: 0 };
  }

  const cohort = cohortRow as unknown as {
    max_students: number | null;
    track_enrollments: { status: string }[] | null;
  };
  const taken = (cohort.track_enrollments ?? []).filter((e) =>
    ["active", "warned"].includes(e.status),
  ).length;

  if (
    cohort.max_students !== null &&
    taken + studentIds.length > cohort.max_students
  ) {
    return { error: "wouldOverfill", added: 0 };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("track_enrollments" as never).insert(
    studentIds.map((studentId) => ({
      cohort_id: cohortId,
      student_id: studentId,
      status: "active",
      joined_at: now,
      decided_by: session.teacher?.id ?? null,
      decided_at: now,
      decision_note: "أُضيفت مباشرةً عند نقل الدفعة إلى النظام",
    })) as never,
  );

  if (error) {
    console.error("addStudents failed", error);
    // 23505 is the unique violation — one of them is already on a track.
    return {
      error: error.code === "23505" ? "alreadyOnATrack" : "saveFailed",
      added: 0,
    };
  }

  revalidatePath(`/${academySlug}/admin/tracks/${trackId}/cohorts/${cohortId}`);
  revalidatePath(`/${academySlug}/admin/tracks/${trackId}`);
  revalidatePath(`/${academySlug}/admin/tracks`);
  revalidatePath(`/${academySlug}/admin`);

  return { error: null, added: studentIds.length };
}

/**
 * Take a student off the cohort.
 *
 * `withdrawn`, never a delete: her recitations and any warning she was given
 * stay attached to the row, and the seat she held is freed either way (the
 * seat-freed trigger fires on exactly this transition).
 */
export async function removeStudent(formData: FormData): Promise<void> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const cohortId = String(formData.get("cohortId") ?? "");
  const enrolmentId = String(formData.get("enrolmentId") ?? "");

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return;
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("track_enrollments" as never)
    .update({
      status: "withdrawn",
      left_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, enrolmentId as never)
    .eq("cohort_id" as never, cohortId as never);

  if (error) console.error("removeStudent failed", error);

  revalidatePath(`/${academySlug}/admin/tracks/${trackId}/cohorts/${cohortId}`);
  revalidatePath(`/${academySlug}/admin/tracks/${trackId}`);
  revalidatePath(`/${academySlug}/admin`);
}
