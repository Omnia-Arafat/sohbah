"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { credentialEmail, normalizePhone } from "@/lib/auth/teacher-credentials";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { TeacherLoginState, TeacherLoginValues } from "./teacher-state";

const MIN_PHONE_DIGITS = 7;

/**
 * Signs a teacher or supervisor in with their phone number and password.
 *
 * The phone number is translated into the synthetic address their Supabase
 * account was created under; the password is the one they chose. Ordinary
 * Supabase auth from there, so the session, the cookies and every RLS policy
 * behave exactly as they do for an email sign-in.
 */
export async function teacherSignIn(
  _previous: TeacherLoginState,
  formData: FormData,
): Promise<TeacherLoginState> {
  const values: TeacherLoginValues = {
    phone: String(formData.get("phone") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();

  const fieldErrors: Partial<Record<keyof TeacherLoginValues, string>> = {};
  if (!values.phone) fieldErrors.phone = "phoneRequired";
  else if ((normalizePhone(values.phone) ?? "").length < MIN_PHONE_DIGITS) {
    fieldErrors.phone = "phoneInvalid";
  }
  if (!values.password) fieldErrors.password = "passwordRequired";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { status: "failed", values, reason: "notConfigured" };
  }

  const supabase = await createClient();
  const phoneKey = normalizePhone(values.phone)!;

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: credentialEmail(phoneKey, academySlug),
    password: values.password,
  });

  if (signInError) {
    /*
      Say which half is wrong.

      This used to be one message for both, so that nobody could test numbers
      against the staff list. The number IS the account — `normalizePhone`
      keeps digits only, so "0561094834" and "+966561094834" are two different
      accounts for one person — and telling her the PASSWORD was wrong sent her
      to a reset that could never help. See the migration for what the change
      gives up.

      A failure of the lookup itself falls back to the old combined message
      rather than guessing: being vague is recoverable, being confidently wrong
      about which field to fix is not.
    */
    const { data: registered, error: lookupError } = await supabase.rpc(
      "staff_phone_registered",
      { p_phone_key: phoneKey, p_academy_slug: academySlug },
    );

    if (lookupError) {
      console.error("staff_phone_registered failed", lookupError);
      return { status: "failed", values, reason: "invalidCredentials" };
    }

    return {
      status: "failed",
      values,
      reason: registered ? "wrongPassword" : "phoneNotFound",
    };
  }

  // Signed in, but approval is separate. RLS lets them read their own row.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: teacher } = await supabase
    .from("teachers")
    .select("is_active")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();

  if (!teacher?.is_active) {
    // Do not leave a usable session lying around for an unapproved account.
    await supabase.auth.signOut();
    return { status: "failed", values, reason: "pending" };
  }

  revalidatePath("/", "layout");

  const locale = await getLocale();
  // `next` comes from the query string, so accept only a local path — never a
  // protocol-relative one, which would send the teacher to another site.
  const target =
    next && next.startsWith("/") && !next.startsWith("//")
      ? `/${locale}${next}`
      : `/${locale}/${academySlug}/dashboard`;

  redirect(target);
}
