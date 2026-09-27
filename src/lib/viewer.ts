import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { GenderCategory } from "@/lib/database.types";
import { STUDENT_COOKIE } from "@/lib/student-cookie";

/**
 * Who is looking at a page, as far as what they may see goes.
 *
 * The academy runs men's and women's circles side by side, and neither side
 * may see the other's: not its circles, not its queues, not its names. Staff
 * are not filtered here. A student's side is her own record's
 * `gender_category`, looked up from the id in the sign-in cookie — never read
 * from the cookie itself, so it cannot be claimed.
 *
 * Anything that is not a known staff member or a known student is a stranger,
 * and a stranger is shown neither side. That includes a missing service-role
 * key: failing open here would show every student both.
 */
export type Viewer =
  | { kind: "staff" }
  | { kind: "student"; gender: GenderCategory }
  | { kind: "stranger" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getViewer = cache(async (academyId: string): Promise<Viewer> => {
  const session = await getTeacherSession();
  if (isActiveTeacher(session)) return { kind: "staff" };

  const id = (await cookies()).get(STUDENT_COOKIE)?.value ?? "";
  if (!UUID.test(id)) return { kind: "stranger" };

  if (!isServiceRoleConfigured()) {
    console.error("getViewer: SUPABASE_SERVICE_ROLE_KEY is not set");
    return { kind: "stranger" };
  }

  const { data, error } = await createAdminClient()
    .from("students")
    .select("gender_category")
    .eq("id", id)
    .eq("academy_id", academyId)
    .maybeSingle();

  if (error) console.error("getViewer lookup failed", error);
  return data ? { kind: "student", gender: data.gender_category } : { kind: "stranger" };
});

/**
 * Whether this viewer may see something that belongs to one side. `null`
 * means it belongs to neither in particular (a board covering both).
 */
export function mayViewerSee(viewer: Viewer, gender: GenderCategory | null) {
  if (viewer.kind === "staff") return true;
  if (viewer.kind === "stranger") return false;
  return gender === null || gender === viewer.gender;
}
