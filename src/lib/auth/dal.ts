import { cache } from "react";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import type { Teacher } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Authorization lives here rather than in a layout. A layout does not re-render
 * on every navigation and does not stop nested segments from rendering, so a
 * check placed there would not actually protect anything — pages and server
 * actions call these helpers directly instead.
 *
 * The module is server-only by construction: it reaches Supabase through
 * `@/lib/supabase/server`, which reads `next/headers`.
 */

export type TeacherSession = {
  userId: string;
  email: string | null;
  /**
   * `null` when the signed-in auth user has no `teachers` row. The very first
   * admin has to be linked by hand — `teachers_admin_insert` requires an
   * existing admin — so real deployments do pass through this state. See
   * `supabase/seed/first-admin.sql`.
   */
  teacher: Teacher | null;
};

/**
 * `cache()` memoizes the lookup for the duration of one render pass, so a page
 * and the components it renders share a single round trip.
 */
export const getTeacherSession = cache(
  async (): Promise<TeacherSession | null> => {
    if (!isSupabaseConfigured()) return null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // RLS (`teachers_select_self_or_admin`) already limits this to the caller's
    // own row, so no extra filtering is needed beyond the join key.
    const { data, error } = await supabase
      .from("teachers")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) console.error("teacher lookup failed", error);

    return {
      userId: user.id,
      email: user.email ?? null,
      teacher: data ?? null,
    };
  },
);

/**
 * Guarantees a signed-in auth user, nothing more. Callers decide how to present
 * an unlinked or deactivated teacher, since both are recoverable states that
 * deserve an explanation rather than a redirect loop.
 *
 * @param next Path to return to after signing in. Must be locale-free.
 */
export async function requireTeacherSession(
  next?: string,
): Promise<TeacherSession> {
  const session = await getTeacherSession();
  if (session) return session;

  const locale = await getLocale();
  // `redirect` throws; returning it is what tells TypeScript so.
  const loginPath = `/${locale}/sohbah/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return redirect(loginPath);
}

/** A teacher who may actually act: linked to an auth user and not deactivated. */
export function isActiveTeacher(
  session: TeacherSession | null,
): session is TeacherSession & { teacher: Teacher } {
  return Boolean(session?.teacher?.is_active);
}

/** An active teacher whose role is `admin`. */
export function isAdmin(
  session: TeacherSession | null,
): session is TeacherSession & { teacher: Teacher } {
  return isActiveTeacher(session) && session.teacher.role === "admin";
}

/**
 * Guard for screens that only *read*. Any approved person — معلمة or مشرفة —
 * may look at the admin area; the controls that change something are gated
 * separately with `isAdmin()`, and every server action re-checks for itself.
 *
 * This is deliberately a single tier for now. When the real per-role
 * permissions are defined, this is the seam they belong in.
 *
 * @param next Path to return to after signing in. Must be locale-free.
 */
export async function requireStaffSession(
  next?: string,
): Promise<TeacherSession & { teacher: Teacher }> {
  const session = await requireTeacherSession(next);
  if (isActiveTeacher(session)) return session;
  notFound();
}

/**
 * Guard for screens and actions that *change* something. A signed-in non-admin
 * gets a 404 rather than a "forbidden" page.
 *
 * @param next Path to return to after signing in. Must be locale-free.
 */
export async function requireAdminSession(
  next?: string,
): Promise<TeacherSession & { teacher: Teacher }> {
  const session = await requireTeacherSession(next);
  if (isAdmin(session)) return session;
  notFound();
}
