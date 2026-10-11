"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getTeacherSession, isActiveTeacher, isAdmin } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import {
  credentialEmail,
  generateTemporaryPassword,
  normalizePhone,
} from "@/lib/auth/teacher-credentials";
import { normalizeName } from "@/lib/cohort-dal";
import { STAFF_OPTION, STUDENT_OPTION } from "@/lib/cohort-supervisors";
import { fullStudentName } from "@/lib/student-name";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SupervisorState =
  | { status: "idle" }
  | { status: "error"; message: string; staffName?: string }
  | {
      status: "done";
      name: string;
      /** Set only when a sign-in was just created for her: shown once. */
      password?: string;
      phone?: string;
    };

type StaffRow = {
  id: string;
  name: string;
  roles: string[] | null;
  role: string;
  is_active: boolean;
  gender_category: string;
  phone_key: string | null;
};

const SUPERVISING = ["supervisor", "admin"];
const holdsSupervisorRole = (row: Pick<StaffRow, "roles" | "role">) =>
  (row.roles ?? [row.role]).some((role) => SUPERVISING.includes(role));

function refresh(academySlug: string, trackId: string, cohortId: string) {
  revalidatePath(`/${academySlug}/admin/tracks/${trackId}/cohorts/${cohortId}`);
  revalidatePath(`/${academySlug}/admin/teachers`);
}

/**
 * Name someone a مشرفة of this دفعة.
 *
 * Staff who already hold the role are simply assigned. Staff who do not, and
 * students, are first given the role — which only an admin may do, the same
 * rule as the staff screen (`teachers_guard_privileged`). A student who has no
 * staff account yet gets one here, on the service key, with a temporary
 * password returned once for the admin to send her.
 */
export async function assignCohortSupervisor(
  _previous: SupervisorState,
  formData: FormData,
): Promise<SupervisorState> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const cohortId = String(formData.get("cohortId") ?? "");
  const choice = String(formData.get("candidate") ?? "");

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) {
    return { status: "error", message: "notAuthorized" };
  }
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "error", message: "notFound" };

  const supabase = await createClient();
  const { data: cohortRow } = await supabase
    .from("track_cohorts" as never)
    .select("id, gender_category")
    .eq("id" as never, cohortId as never)
    .eq("academy_id" as never, academy.id as never)
    .maybeSingle();
  const cohort = cohortRow as { id: string; gender_category: string } | null;
  if (!cohort) return { status: "error", message: "notFound" };

  let teacherId: string;
  let name: string;
  let password: string | undefined;
  let phone: string | undefined;

  if (choice.startsWith(STAFF_OPTION)) {
    const { data } = await supabase
      .from("teachers")
      .select("id, name, roles, role, is_active, gender_category, phone_key")
      .eq("id", choice.slice(STAFF_OPTION.length))
      .eq("academy_id", academy.id)
      .maybeSingle();
    const staff = data as StaffRow | null;
    if (!staff || !staff.is_active) return { status: "error", message: "notFound" };

    if (!holdsSupervisorRole(staff)) {
      if (!isAdmin(session)) return { status: "error", message: "needsAdmin" };
      const granted = await grantSupervisorRole(supabase, staff);
      if (!granted) return { status: "error", message: "saveFailed" };
    }
    teacherId = staff.id;
    name = staff.name;
  } else if (choice.startsWith(STUDENT_OPTION)) {
    if (!isAdmin(session)) return { status: "error", message: "needsAdmin" };
    if (!isServiceRoleConfigured()) return { status: "error", message: "notConfigured" };

    const result = await studentToSupervisor(
      choice.slice(STUDENT_OPTION.length),
      academy.id,
      academySlug,
      cohort.gender_category,
      supabase,
    );
    if ("error" in result) {
      return { status: "error", message: result.error, staffName: result.staffName };
    }
    ({ teacherId, name, password, phone } = result);
  } else {
    return { status: "error", message: "pickFirst" };
  }

  const { error } = await supabase.from("track_cohort_supervisors" as never).insert({
    cohort_id: cohort.id,
    teacher_id: teacherId,
    assigned_by: session.teacher.id,
  } as never);

  // 23505: she is already a مشرفة of this دفعة — the wanted end state.
  if (error && error.code !== "23505") {
    console.error("cohort supervisor insert failed", error);
    return { status: "error", message: "saveFailed" };
  }

  refresh(academySlug, trackId, cohortId);
  return { status: "done", name, password, phone };
}

/** Take a مشرفة off this دفعة. Her role and her account are left alone. */
export async function removeCohortSupervisor(formData: FormData): Promise<void> {
  const academySlug = String(formData.get("academySlug") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  const cohortId = String(formData.get("cohortId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");

  const session = await getTeacherSession();
  if (!session || !isActiveTeacher(session) || !canSupervise(session.teacher)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("track_cohort_supervisors" as never)
    .delete()
    .eq("cohort_id" as never, cohortId as never)
    .eq("teacher_id" as never, teacherId as never);
  if (error) console.error("cohort supervisor delete failed", error);

  refresh(academySlug, trackId, cohortId);
}

/**
 * Adds `supervisor` to her roles. Written with the signed-in admin's own
 * client, so the database's admin-only guard on roles still decides.
 */
async function grantSupervisorRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staff: Pick<StaffRow, "id" | "roles" | "role">,
) {
  const roles = new Set(staff.roles ?? [staff.role]);
  roles.add("teacher");
  roles.add("supervisor");
  const { error } = await supabase
    .from("teachers")
    .update({ roles: [...roles] as never })
    .eq("id", staff.id);
  if (error) console.error("granting supervisor role failed", error);
  return !error;
}

/**
 * Gives a student a staff account holding the مشرفة role, or finds the one she
 * already has.
 *
 * The same person is never given a second staff row: she may already be
 * linked to one (students.teacher_id), or a member of staff may already exist
 * on her number with her name. A different name on her number is refused
 * rather than guessed at — households share one phone, and that number may be
 * her mother's account.
 */
async function studentToSupervisor(
  studentId: string,
  academyId: string,
  academySlug: string,
  cohortGender: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<
  | { teacherId: string; name: string; password?: string; phone?: string }
  | { error: string; staffName?: string }
> {
  const admin = createAdminClient();

  const { data: studentData } = await admin
    .from("students")
    .select("id, name, father_name, phone, phone_key, gender_category, teacher_id")
    .eq("id", studentId)
    .eq("academy_id", academyId)
    .maybeSingle();
  const student = studentData as {
    id: string;
    name: string;
    father_name: string | null;
    phone: string | null;
    phone_key: string | null;
    gender_category: string;
    teacher_id: string | null;
  } | null;
  if (!student) return { error: "notFound" };
  if (student.gender_category !== cohortGender) return { error: "otherSide" };

  // Already linked to a staff account: that is her.
  if (student.teacher_id) {
    const { data } = await admin
      .from("teachers")
      .select("id, name, roles, role, is_active, gender_category, phone_key")
      .eq("id", student.teacher_id)
      .maybeSingle();
    const staff = data as StaffRow | null;
    if (!staff) return { error: "notFound" };
    if (!staff.is_active) return { error: "staffInactive", staffName: staff.name };
    if (!holdsSupervisorRole(staff) && !(await grantSupervisorRole(supabase, staff))) {
      return { error: "saveFailed" };
    }
    return { teacherId: staff.id, name: staff.name };
  }

  const phoneKey = normalizePhone(student.phone ?? "");
  if (!student.phone || !phoneKey || phoneKey.length < 9) return { error: "noPhone" };

  const name = fullStudentName(student.name, student.father_name);
  const { data: staffData } = await admin
    .from("teachers")
    .select("id, name, roles, role, is_active, gender_category, phone_key")
    .eq("academy_id", academyId);
  const allStaff = (staffData ?? []) as StaffRow[];

  const onHerNumber = allStaff.find(
    (staff) => staff.phone_key && staff.phone_key.slice(-9) === phoneKey.slice(-9),
  );
  if (onHerNumber) {
    const sameName =
      normalizeName(onHerNumber.name) === normalizeName(student.name) ||
      normalizeName(onHerNumber.name) === normalizeName(name);
    if (!sameName) return { error: "phoneBelongsToStaff", staffName: onHerNumber.name };
    if (!onHerNumber.is_active) {
      return { error: "staffInactive", staffName: onHerNumber.name };
    }

    // Her own staff account under her number: link the two, give the role.
    const { count } = await admin
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id" as never, onHerNumber.id as never);
    if (!count) {
      await admin.from("students").update({ teacher_id: onHerNumber.id } as never).eq("id", student.id);
    }
    if (!holdsSupervisorRole(onHerNumber) && !(await grantSupervisorRole(supabase, onHerNumber))) {
      return { error: "saveFailed" };
    }
    return { teacherId: onHerNumber.id, name: onHerNumber.name };
  }

  // Same rule register_teacher() applies: no two staff under one name.
  const nameTaken = allStaff.find(
    (staff) => normalizeName(staff.name) === normalizeName(name),
  );
  if (nameTaken) return { error: "nameTaken", staffName: nameTaken.name };

  // A new staff account. The service key is needed: creating a sign-in for
  // someone else, and writing roles on a row the admin did not create.
  const { data: created, error: insertError } = await admin
    .from("teachers")
    .insert({
      academy_id: academyId,
      name,
      phone: student.phone,
      gender_category: student.gender_category,
      roles: ["teacher", "supervisor"],
      is_active: true,
    } as never)
    .select("id")
    .single();
  if (insertError || !created) {
    console.error("supervisor staff row failed", insertError);
    return { error: insertError?.code === "23505" ? "phoneBelongsToStaff" : "saveFailed" };
  }
  const newTeacherId = (created as { id: string }).id;

  const password = generateTemporaryPassword();
  const { data: account, error: authError } = await admin.auth.admin.createUser({
    email: credentialEmail(phoneKey, academySlug),
    password,
    email_confirm: true,
  });

  if (authError || !account.user) {
    // Never leave a staff row nobody can sign in to.
    console.error("supervisor createUser failed", authError);
    await admin.from("teachers").delete().eq("id", newTeacherId).is("auth_user_id", null);
    return { error: "accountFailed" };
  }

  const { error: linkError } = await admin
    .from("teachers")
    .update({ auth_user_id: account.user.id })
    .eq("id", newTeacherId);
  if (linkError) {
    console.error("supervisor account link failed", linkError);
    await admin.auth.admin.deleteUser(account.user.id);
    await admin.from("teachers").delete().eq("id", newTeacherId);
    return { error: "accountFailed" };
  }

  // Her student side stays the row she already has, with all her history.
  await admin.from("students").update({ teacher_id: newTeacherId } as never).eq("id", student.id);

  return { teacherId: newTeacherId, name, password, phone: student.phone };
}
