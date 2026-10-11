import { createClient } from "@/lib/supabase/server";
import type { GenderCategory } from "@/lib/database.types";
import { fullStudentName } from "@/lib/student-name";

/** A picker value: `t:<teacher id>` for staff, `s:<student id>` for a student. */
export const STAFF_OPTION = "t:";
export const STUDENT_OPTION = "s:";

export type SupervisorCandidate = {
  value: string;
  name: string;
  /** Who she is now — decides what assigning her will do. */
  kind: "supervisor" | "staff" | "student";
};

export type CohortSupervisors = {
  assigned: { id: string; name: string }[];
  candidates: SupervisorCandidate[];
};

/**
 * The مشرفات of one دفعة, and who could be added.
 *
 * Staff who already supervise can be assigned by any مشرفة. Other staff, and
 * students, need the role first, which only an admin can give — so they are
 * offered to admins only. Only the دفعة's own side is offered.
 *
 * Null until RUN_STEPS_COHORT_SUPERVISORS.sql has run: the page then simply
 * leaves the section out.
 */
export async function loadCohortSupervisors(
  academyId: string,
  cohortId: string,
  viewerIsAdmin: boolean,
): Promise<CohortSupervisors | null> {
  const supabase = await createClient();

  const { data: cohortRow } = await supabase
    .from("track_cohorts" as never)
    .select("gender_category")
    .eq("id" as never, cohortId as never)
    .eq("academy_id" as never, academyId as never)
    .maybeSingle();
  const gender = (cohortRow as { gender_category: NonNullable<GenderCategory> } | null)?.gender_category;
  if (!gender) return null;

  const [links, staff, students] = await Promise.all([
    supabase
      .from("track_cohort_supervisors" as never)
      .select("teacher_id, created_at")
      .eq("cohort_id" as never, cohortId as never)
      .order("created_at" as never),
    supabase
      .from("teachers")
      .select("id, name, roles, role")
      .eq("academy_id", academyId)
      .eq("is_active", true)
      .eq("gender_category", gender)
      .order("name"),
    viewerIsAdmin
      ? supabase
          .from("students")
          .select("id, name, father_name, teacher_id")
          .eq("academy_id", academyId)
          .eq("gender_category", gender)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (links.error) {
    // The table is not there yet: 42P01 from Postgres, PGRST205 from the API.
    if (!["42P01", "PGRST205"].includes(links.error.code)) console.error("cohort supervisors load failed", links.error);
    return null;
  }
  if (staff.error) console.error("cohort supervisor staff load failed", staff.error);
  if (students.error) console.error("cohort supervisor students load failed", students.error);

  const staffRows = (staff.data ?? []) as { id: string; name: string; roles: string[] | null; role: string }[];
  const assignedIds = new Set(
    ((links.data ?? []) as unknown as { teacher_id: string }[]).map((row) => row.teacher_id),
  );
  const nameOf = new Map(staffRows.map((row) => [row.id, row.name]));

  const assigned = [...assignedIds].map((id) => ({ id, name: nameOf.get(id) ?? "—" }));

  const candidates: SupervisorCandidate[] = [];
  for (const row of staffRows) {
    if (assignedIds.has(row.id)) continue;
    const supervises = (row.roles ?? [row.role]).some((r) => r === "supervisor" || r === "admin");
    if (!supervises && !viewerIsAdmin) continue;
    candidates.push({
      value: `${STAFF_OPTION}${row.id}`,
      name: row.name,
      kind: supervises ? "supervisor" : "staff",
    });
  }
  // A student already linked to a staff account is offered as that staff
  // member above, not twice.
  // teacher_id is newer than the generated types.
  for (const row of (students.data ?? []) as unknown as {
    id: string;
    name: string;
    father_name: string | null;
    teacher_id: string | null;
  }[]) {
    if (row.teacher_id) continue;
    candidates.push({
      value: `${STUDENT_OPTION}${row.id}`,
      name: fullStudentName(row.name, row.father_name),
      kind: "student",
    });
  }

  return { assigned, candidates };
}
