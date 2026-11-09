import "server-only";

import { getAcademyBySlug } from "@/lib/academy-dal";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { credentialEmail } from "./teacher-credentials";

/**
 * A staff member's sign-in address is built from her phone key ONCE, when the
 * account is created. Editing her number afterwards changes `phone_key` but not
 * the address, so sign-in — which rebuilds the address from the number she
 * types — looks for an account that does not exist and reports a wrong
 * password, however many times her password is reset.
 *
 * These two helpers close that gap from both ends: sign-in asks for the address
 * the account really has, and reset/edit put the address back in step.
 */

/** The real sign-in addresses of the staff accounts on these phone keys. */
export async function linkedLoginEmails(
  phoneKeys: string[],
  academySlug: string,
): Promise<string[]> {
  if (phoneKeys.length === 0 || !isServiceRoleConfigured()) return [];

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return [];

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("teachers")
    .select("auth_user_id")
    .eq("academy_id", academy.id)
    .in("phone_key", phoneKeys);

  if (error) {
    console.error("linked staff lookup failed", error);
    return [];
  }

  const emails: string[] = [];
  for (const row of rows ?? []) {
    if (!row.auth_user_id) continue;
    const { data, error: userError } = await admin.auth.admin.getUserById(
      row.auth_user_id,
    );
    if (userError) {
      console.error("linked staff account lookup failed", userError);
      continue;
    }
    if (data.user?.email) emails.push(data.user.email);
  }
  return emails;
}

/**
 * Point the account's sign-in address at its current phone key. Returns false
 * when it could not (another account already holds that address) — the caller
 * carries on, because sign-in still finds her through `linkedLoginEmails`.
 */
export async function syncLoginEmail(
  authUserId: string,
  phoneKey: string,
  academySlug: string,
): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    email: credentialEmail(phoneKey, academySlug),
    email_confirm: true,
  });

  if (error) {
    console.error("staff sign-in address sync failed", error);
    return false;
  }
  return true;
}
