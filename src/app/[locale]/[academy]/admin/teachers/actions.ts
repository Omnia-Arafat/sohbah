"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { isAdmin, requireTeacherSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { generateTemporaryPassword } from "@/lib/auth/teacher-credentials";

type Context = {
  teacherId: string;
  academySlug: string;
  locale: string;
};

function readContext(formData: FormData): Context {
  return {
    teacherId: String(formData.get("teacherId") ?? ""),
    academySlug: String(formData.get("academySlug") ?? ""),
    locale: String(formData.get("locale") ?? ""),
  };
}

/**
 * Every action here is admin-only. RLS (`teachers_update_self_or_admin` /
 * `teachers_admin_delete`) is the real guard; this returns the academy so the
 * queries can also be scoped to it, and gives a non-admin a clean no-op instead
 * of a silent RLS failure.
 */
async function authorize(context: Context) {
  const session = await requireTeacherSession(
    `/${context.academySlug}/admin/teachers`,
  );
  if (!isAdmin(session)) return null;

  const academy = await getAcademyBySlug(context.academySlug);
  if (!academy) return null;

  return { session, academy };
}

function refresh(context: Context) {
  revalidatePath(`/${context.locale}/${context.academySlug}/admin/teachers`);
}

/** Approve an application, or suspend an approved teacher. */
export async function setTeacherActive(formData: FormData) {
  const context = readContext(formData);
  const isActive = formData.get("isActive") === "1";

  const auth = await authorize(context);
  if (!auth) return;

  // Suspending yourself would lock the academy out of its own admin area, and
  // nothing else in the app could undo it.
  if (auth.session.teacher.id === context.teacherId && !isActive) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update({ is_active: isActive })
    .eq("id", context.teacherId)
    .eq("academy_id", auth.academy.id);

  if (error) console.error("teacher activation failed", error);

  refresh(context);
}

/**
 * Reject an application, or remove a teacher entirely.
 *
 * `circles.teacher_id` is `on delete cascade`, and `attendance_records.circle_id`
 * cascades in turn — so deleting a teacher who owns circles would silently take
 * every one of their circles and the whole attendance history with them. That is
 * never what "reject this application" means, so the delete is refused while any
 * circle still points at them; the admin reassigns those circles first.
 */
export async function deleteTeacher(formData: FormData) {
  const context = readContext(formData);

  const auth = await authorize(context);
  if (!auth) return;

  // Deleting yourself would drop the academy's own admin access.
  if (auth.session.teacher.id === context.teacherId) return;

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("circles")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", context.teacherId);

  if (countError) {
    console.error("circle count failed", countError);
    return;
  }

  if ((count ?? 0) > 0) {
    // Surfaced by the page as a blocked-delete notice rather than thrown: the
    // admin needs to know why, not see an error screen.
    refresh(context);
    return;
  }

  const { error } = await supabase
    .from("teachers")
    .delete()
    .eq("id", context.teacherId)
    .eq("academy_id", auth.academy.id);

  if (error) console.error("teacher delete failed", error);

  refresh(context);
}

export type UpdateTeacherState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "invalid";
      values: { name: string; phone: string; gender: string; role: string };
      fieldErrors: Record<string, string>;
    };

/**
 * Edit a teacher's details, including whether they are a معلمة or a مشرفة.
 * Changing your own role is refused: demoting yourself mid-edit would revoke
 * the very permission the save depends on.
 */
export async function updateTeacher(
  _previous: UpdateTeacherState,
  formData: FormData,
): Promise<UpdateTeacherState> {
  const context = readContext(formData);
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const role = String(formData.get("role") ?? "");
  const values = { name, phone, gender, role };

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "nameRequired";
  else if (name.length > 120) fieldErrors.name = "tooLong";

  if (!phone) fieldErrors.phone = "phoneRequired";
  else if (phone.length > 32) fieldErrors.phone = "tooLong";
  else if (phone.replace(/^00/, "").replace(/\D/g, "").length < 7) {
    fieldErrors.phone = "phoneInvalid";
  }

  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "genderRequired";
  }

  if (role !== "teacher" && role !== "admin") {
    fieldErrors.role = "roleRequired";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  const auth = await authorize(context);
  if (!auth) return { status: "error", message: "unauthorized" };

  const isSelf = auth.session.teacher.id === context.teacherId;
  if (isSelf && role !== auth.session.teacher.role) {
    return { status: "invalid", values, fieldErrors: { role: "cannotChangeOwnRole" } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update({
      name,
      phone,
      gender_category: gender as "male" | "female",
      role: role as "teacher" | "admin",
    })
    .eq("id", context.teacherId)
    .eq("academy_id", auth.academy.id);

  if (error) {
    // uq_teachers_phone_per_academy
    if (error.code === "23505") {
      return { status: "invalid", values, fieldErrors: { phone: "phoneTaken" } };
    }
    console.error("teacher update failed", error);
    return { status: "error", message: "saveFailed" };
  }

  refresh(context);
  return { status: "idle" };
}

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "done"; password: string }
  | { status: "error"; message: string };

/**
 * Issues a new temporary password for a teacher and returns it once, for the
 * supervisor to pass on.
 *
 * Needs the service role: nothing else can set another user's password. The new
 * password is returned to the caller and never stored anywhere by us — Supabase
 * keeps only its hash, so if the supervisor loses it before sending it on, the
 * only remedy is to reset again.
 */
export async function resetTeacherPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const context = readContext(formData);

  const auth = await authorize(context);
  if (!auth) return { status: "error", message: "unauthorized" };

  if (!isServiceRoleConfigured()) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set — reset unavailable");
    return { status: "error", message: "notConfigured" };
  }

  const supabase = await createClient();
  const { data: teacher } = await supabase
    .from("teachers")
    .select("auth_user_id")
    .eq("id", context.teacherId)
    .eq("academy_id", auth.academy.id)
    .maybeSingle();

  // No linked account means they registered before passwords existed, or the
  // sign-in was never created. Resetting cannot help; they register again.
  if (!teacher?.auth_user_id) {
    return { status: "error", message: "noAccount" };
  }

  const password = generateTemporaryPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(teacher.auth_user_id, {
    password,
  });

  if (error) {
    console.error("password reset failed", error);
    return { status: "error", message: "saveFailed" };
  }

  return { status: "done", password };
}
