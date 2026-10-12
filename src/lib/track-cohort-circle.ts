import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A cohort's weekly لقاء is its teacher's «مسارات» circle. Nobody picks it by
 * hand: when she has exactly one active circle of that type, that is the one.
 * With none — or several, where guessing would be wrong — it is left unlinked.
 */
export async function trackCircleForTeacher(
  supabase: Supabase,
  academyId: string,
  teacherId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("circles")
    .select("id")
    .eq("academy_id", academyId)
    .eq("teacher_id", teacherId)
    .eq("type", "tracks")
    .eq("is_active", true)
    .limit(2);
  if (error) console.error("trackCircleForTeacher failed", error);
  return data && data.length === 1 ? data[0].id : null;
}
