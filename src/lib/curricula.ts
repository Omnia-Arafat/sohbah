import type { SupabaseClient } from "@supabase/supabase-js";
import type { Curriculum, CurriculumUnit, Database } from "@/lib/database.types";

/**
 * A curriculum belongs to a circle *type*, not to a circle — "الأربعون
 * النووية" under `hadith`, "تحفة الأطفال" under `tajweed`. Everything that
 * lists or picks one filters by that type, which is why adding the tajweed
 * curriculum later is data entry rather than a code change.
 *
 * Mirrors `loadCircleTypes()` deliberately: same signature, same
 * `activeOnly` escape hatch, same swallow-and-log on failure so one broken
 * query does not take a whole page down.
 */
export async function loadCurricula(
  supabase: SupabaseClient<Database>,
  academyId: string,
  {
    circleType,
    activeOnly = true,
  }: { circleType?: string; activeOnly?: boolean } = {},
): Promise<Curriculum[]> {
  let query = supabase
    .from("curricula")
    .select("*")
    .eq("academy_id", academyId)
    .order("display_order")
    .order("created_at");

  if (circleType) query = query.eq("circle_type", circleType);
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("curricula load failed", error);
    return [];
  }
  return data ?? [];
}

export async function loadCurriculum(
  supabase: SupabaseClient<Database>,
  academyId: string,
  id: string,
): Promise<Curriculum | null> {
  const { data, error } = await supabase
    .from("curricula")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academyId)
    .maybeSingle();

  if (error) {
    console.error("curriculum load failed", error);
    return null;
  }
  return data;
}

export async function loadUnits(
  supabase: SupabaseClient<Database>,
  curriculumId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<CurriculumUnit[]> {
  let query = supabase
    .from("curriculum_units")
    .select("*")
    .eq("curriculum_id", curriculumId)
    .order("position");

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("curriculum units load failed", error);
    return [];
  }
  return data ?? [];
}

export function curriculumLabel(
  curriculum: Pick<Curriculum, "name_ar" | "name_en">,
  locale: string,
): string {
  return locale === "ar" ? curriculum.name_ar : curriculum.name_en;
}

export function unitLabel(
  unit: Pick<CurriculumUnit, "title_ar" | "title_en">,
  locale: string,
): string {
  return locale === "ar" ? unit.title_ar : unit.title_en;
}
