"use server";

import type { TeacherRole } from "@/lib/database.types";
import {
  MIN_PASSWORD_LENGTH,
  credentialEmail,
  normalizePhone,
} from "@/lib/auth/teacher-credentials";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  TeacherApplicationState,
  TeacherApplicationValues,
} from "./state";

const MAX_NAME = 120;
const MIN_PHONE_DIGITS = 7;

function readValues(formData: FormData): TeacherApplicationValues {
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: read("name"),
    phone: read("phone"),
    role: read("role"),
    // Not trimmed: leading and trailing spaces are legitimate password
    // characters, and silently removing them would break the next sign-in.
    password: String(formData.get("password") ?? ""),
  };
}

/**
 * Registers a teacher or supervisor.
 *
 * Two things are created: the `teachers` row (pending approval) and the
 * Supabase Auth account behind their password. The account is made with the
 * service role so it arrives already confirmed — the synthetic address it uses
 * can never receive a confirmation email.
 *
 * Creating the sign-in here does NOT grant access: `register_teacher()` writes
 * `is_active = false`, and every policy checks that. They can sign in only once
 * a supervisor approves them.
 */
export async function applyAsTeacher(
  _previous: TeacherApplicationState,
  formData: FormData,
): Promise<TeacherApplicationState> {
  const values = readValues(formData);
  const academyId = String(formData.get("academyId") ?? "").trim();
  const academySlug = String(formData.get("academySlug") ?? "").trim();

  const fieldErrors: Partial<Record<keyof TeacherApplicationValues, string>> =
    {};

  if (!values.name) fieldErrors.name = "nameRequired";
  else if (values.name.length > MAX_NAME) fieldErrors.name = "tooLong";

  if (!values.phone) fieldErrors.phone = "phoneRequired";
  else if (values.phone.length > 32) fieldErrors.phone = "tooLong";
  else if ((normalizePhone(values.phone) ?? "").length < MIN_PHONE_DIGITS) {
    fieldErrors.phone = "phoneInvalid";
  }

  if (values.role !== "teacher" && values.role !== "admin") {
    fieldErrors.role = "roleRequired";
  }

  if (!values.password) fieldErrors.password = "passwordRequired";
  else if (values.password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = "passwordTooShort";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
    if (!isServiceRoleConfigured()) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not set — registration disabled");
    }
    return { status: "failed", values, reason: "notConfigured" };
  }

  if (!academyId || !academySlug) {
    return { status: "failed", values, reason: "generic" };
  }

  const supabase = await createClient();

  // The teacher row first: it validates the input and owns the "one account per
  // number" rule, so a duplicate is rejected before any account is created.
  const { error } = await supabase.rpc("register_teacher", {
    p_academy_id: academyId,
    p_name: values.name,
    p_phone: values.phone,
    p_role: values.role as TeacherRole,
  });

  if (error) {
    if (error.message.includes("phone_taken")) {
      return { status: "invalid", values, fieldErrors: { phone: "phoneTaken" } };
    }
    console.error("register_teacher failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  const phoneKey = normalizePhone(values.phone)!;
  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: credentialEmail(phoneKey, academySlug),
    password: values.password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    // The teacher row exists but has no sign-in, which would strand them with
    // no way to recover. Roll it back so they can simply register again.
    console.error("createUser failed", authError);
    await admin
      .from("teachers")
      .delete()
      .eq("academy_id", academyId)
      .eq("phone_key", phoneKey)
      .is("auth_user_id", null);

    return { status: "failed", values, reason: "generic" };
  }

  // Link the account. Uses the service role because the applicant is not signed
  // in and no policy would let them write this.
  const { error: linkError } = await admin
    .from("teachers")
    .update({ auth_user_id: created.user.id })
    .eq("academy_id", academyId)
    .eq("phone_key", phoneKey)
    .is("auth_user_id", null);

  if (linkError) {
    console.error("linking auth user failed", linkError);
    await admin.auth.admin.deleteUser(created.user.id);
    return { status: "failed", values, reason: "generic" };
  }

  return { status: "success", name: values.name };
}
