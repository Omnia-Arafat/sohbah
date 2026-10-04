import { createClient } from "@/lib/supabase/server";
import { isMissingSchema } from "@/lib/tracks-dal";

/**
 * One cohort's roster: who is on it, who is waiting, and who is left to add.
 *
 * Same `null` / "missing-schema" convention as the other track readers — see
 * the note at the top of src/lib/tracks-dal.ts.
 */

export type Enrolment = {
  id: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  status: string;
  requestedAt: string;
  joinedAt: string | null;
};

export type CohortDetail = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  maxStudents: number | null;
  teacherName: string | null;
  trackId: string;
  trackName: string;
  durationWeeks: number;
  /** active + warned — the ones holding a seat. */
  enrolled: Enrolment[];
  /** pending + waitlisted — the ones awaiting a decision. */
  waiting: Enrolment[];
};

type RawEnrolment = {
  id: string;
  student_id: string;
  status: string;
  requested_at: string;
  joined_at: string | null;
  students: { name: string; father_name: string } | null;
};

type RawCohort = {
  id: string;
  name_ar: string;
  status: string;
  start_date: string;
  max_students: number | null;
  track_id: string;
  teachers: { name: string } | null;
  tracks: { name_ar: string; duration_weeks: number; academy_id: string } | null;
  track_enrollments: RawEnrolment[] | null;
};

const HOLDS_A_SEAT = ["active", "warned"];
const AWAITING = ["pending", "waitlisted"];

export async function getCohort(
  academyId: string,
  cohortId: string,
): Promise<CohortDetail | null | "missing-schema"> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("track_cohorts" as never)
    .select(
      "id, name_ar, status, start_date, max_students, track_id, " +
        "teachers(name), tracks!inner(name_ar, duration_weeks, academy_id), " +
        "track_enrollments(id, student_id, status, requested_at, joined_at, " +
        "students(name, father_name))",
    )
    .eq("id" as never, cohortId as never)
    .eq("academy_id" as never, academyId as never)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error.code)) return "missing-schema";
    console.error("getCohort failed", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as RawCohort;

  const toEnrolment = (e: RawEnrolment): Enrolment => ({
    id: e.id,
    studentId: e.student_id,
    studentName: e.students?.name ?? "",
    fatherName: realFatherName(e.students?.father_name),
    status: e.status,
    requestedAt: e.requested_at,
    joinedAt: e.joined_at,
  });

  const all = row.track_enrollments ?? [];
  const byName = (a: Enrolment, b: Enrolment) =>
    a.studentName.localeCompare(b.studentName, "ar");

  return {
    id: row.id,
    name: row.name_ar,
    status: row.status,
    startDate: row.start_date,
    maxStudents: row.max_students,
    teacherName: row.teachers?.name ?? null,
    trackId: row.track_id,
    trackName: row.tracks?.name_ar ?? "",
    durationWeeks: row.tracks?.duration_weeks ?? 40,
    enrolled: all.filter((e) => HOLDS_A_SEAT.includes(e.status)).map(toEnrolment).sort(byName),
    waiting: all
      .filter((e) => AWAITING.includes(e.status))
      .map(toEnrolment)
      // Oldest request first: a queue served out of order is not a queue.
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
  };
}

/**
 * A father's name, or "" when there is not really one on file.
 *
 * 172 of the academy's students carry a literal "-" in `father_name`, left by
 * the import that filled a required column with a placeholder. Rendered
 * straight, every roster row reads "ندى مجدي -", which looks like broken
 * data rather than a missing field.
 *
 * Fixed here rather than in the table: the rows are real student records on a
 * live site, a display convention is reversible, and an UPDATE over 172 of
 * them is not.
 */
function realFatherName(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "-" || trimmed === "—" ? "" : trimmed;
}

/** Close enough to the database's normalize_ar to compare two spellings of a name. */
function normalizeName(value: string) {
  return value
    .trim()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

export type Candidate = {
  /** A student id, or `staff:<teacher id>` for staff with no student row yet. */
  id: string;
  name: string;
  fatherName: string;
  /** A معلمة, مشرفة or admin, added as a student. */
  staff: boolean;
};

/** The prefix that marks a staff member who has no student row yet. */
export const STAFF_CANDIDATE = "staff:";

/**
 * Students of this academy who are not already on THIS track.
 *
 * A student may be on several tracks (20261004140000_multiple_tracks), but not
 * hold two places on one — the database refuses that — so offering a student
 * who is already on this track, in any of its cohorts, would only produce a
 * failed insert. Filtering here means the picker never shows a name that
 * cannot be chosen.
 */
export async function listAddableStudents(
  academyId: string,
  trackId: string,
): Promise<Candidate[]> {
  const supabase = await createClient();

  const [studentsResult, takenResult, staffResult] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, father_name, teacher_id, phone_key")
      .eq("academy_id", academyId)
      .order("name"),
    supabase
      .from("track_enrollments" as never)
      .select("student_id, status, track_cohorts!inner(track_id)")
      .in("status" as never, [...HOLDS_A_SEAT, ...AWAITING] as never)
      .eq("track_cohorts.track_id" as never, trackId as never),
    // Staff can be students too — a مشرفة on a track. The ones who already
    // have a student row come in with the students above; the rest are offered
    // here and get their row when added (staff_as_student).
    supabase
      .from("teachers")
      .select("id, name, phone")
      .eq("academy_id", academyId)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (studentsResult.error) {
    console.error("listAddableStudents (students) failed", studentsResult.error);
    return [];
  }

  // A missing table here is not fatal: before the migration every student is
  // addable, which is the correct answer.
  const taken = new Set(
    takenResult.error
      ? []
      : ((takenResult.data ?? []) as unknown as { student_id: string }[]).map(
          (e) => e.student_id,
        ),
  );

  // teacher_id is newer than the generated types.
  const students = (studentsResult.data ?? []) as unknown as {
    id: string;
    name: string;
    father_name: string | null;
    teacher_id: string | null;
    phone_key: string | null;
  }[];
  const staffWithRow = new Set(students.map((s) => s.teacher_id).filter(Boolean));

  const fromStudents: Candidate[] = students
    .filter((s) => !taken.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      fatherName: realFatherName(s.father_name),
      staff: Boolean(s.teacher_id),
    }));

  if (staffResult.error) console.error("listAddableStudents (staff) failed", staffResult.error);
  /*
    A member of staff who already has a student row of her own — same number,
    her name inside its name — is that row, not a second entry. Adding her
    links it (staff_existing_student), so listing both would invite exactly
    the duplicate حنان سيد got.
  */
  const hasOwnStudentRow = (teacher: { name: string; phone: string | null }) => {
    const last9 = (teacher.phone ?? "").replace(/\D/g, "").slice(-9);
    if (last9.length < 9) return false;
    const name = normalizeName(teacher.name);
    return students.some(
      (s) =>
        !s.teacher_id &&
        (s.phone_key ?? "").slice(-9) === last9 &&
        normalizeName(s.name).includes(name),
    );
  };

  const fromStaff: Candidate[] = ((staffResult.data ?? []) as { id: string; name: string; phone: string | null }[])
    .filter((teacher) => !staffWithRow.has(teacher.id) && !hasOwnStudentRow(teacher))
    .map((teacher) => ({
      id: `${STAFF_CANDIDATE}${teacher.id}`,
      name: teacher.name,
      fatherName: "",
      staff: true,
    }));

  return [...fromStudents, ...fromStaff].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
