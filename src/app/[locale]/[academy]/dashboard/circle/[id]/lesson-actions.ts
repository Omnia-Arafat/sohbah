"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type LessonState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "failed"; reason: string };

/**
 * Records what this circle is teaching today.
 *
 * The session date is not taken from the form — it is resolved from the
 * circle's own timezone, the same way `join_circle()` and `circle_queue()` do
 * it. A 05:00 Fajr circle in Riyadh and a server in UTC disagree about what
 * "today" is for several hours a day, and the queue already settled that
 * argument; the lesson has to give the same answer or the two drift apart.
 *
 * `sessions_write_owner` is the real guard — the circle's own معلمة, or a
 * مشرفة of the academy. This only fails early with a message.
 */
export async function setTodayLesson(
  _previous: LessonState,
  formData: FormData,
): Promise<LessonState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const circleId = String(formData.get("circleId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const session = await requireStaffSession(
    `/${academySlug}/dashboard/circle/${circleId}`,
  );

  const supabase = await createClient();

  const { data: circle } = await supabase
    .from("circles")
    .select("id, registration_slug")
    .eq("id", circleId)
    .maybeSingle();

  if (!circle) return { status: "failed", reason: "generic" };

  const { data: info, error: infoError } = await supabase.rpc("circle_public_info", {
    p_slug: circle.registration_slug,
  });

  const sessionDate = info?.[0]?.session_date;
  if (infoError || !sessionDate) {
    console.error("lesson date lookup failed", infoError);
    return { status: "failed", reason: "generic" };
  }

  const { error } = await supabase.from("circle_sessions").upsert(
    {
      circle_id: circleId,
      session_date: sessionDate,
      // An empty select means "no lesson set" rather than an invalid id.
      unit_id: unitId || null,
      note: note || null,
      updated_by: session.teacher.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "circle_id,session_date" },
  );

  if (error) {
    console.error("lesson save failed", error);
    return { status: "failed", reason: "generic" };
  }

  revalidatePath(`/${academySlug}/dashboard/circle/${circleId}`);
  revalidatePath(`/${academySlug}/circle/${circle.registration_slug}`);
  return { status: "saved" };
}
