import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Circle types are an open, academy-managed list (see the `circle_types`
 * table and `/admin/circle-types`), not a fixed set baked into the code — an
 * admin can add "حلقة الحديث" or anything else at any time. Every place that
 * shows or picks a circle type loads this list rather than hard-coding one,
 * so a newly added type appears everywhere at once with no code change.
 */
export async function loadCircleTypes(
  supabase: SupabaseClient<Database>,
  academyId: string,
  { activeOnly = true }: { activeOnly?: boolean } = {},
) {
  let query = supabase
    .from("circle_types")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at");

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("circle_types load failed", error);
    return [];
  }
  return data ?? [];
}

/**
 * A newly added type has no i18n key by construction — it carries its own
 * bilingual name — so this looks it up from the loaded list rather than
 * reaching for `useTranslations`. Falls back to the raw slug for a type that
 * has since been deleted at the database level (never happens through the
 * app, since no delete is offered, but a defensive fallback beats a crash).
 */
export function circleTypeLabel(
  types: { slug: string; name_ar: string; name_en: string }[],
  slug: string,
  locale: string,
): string {
  const match = types.find((type) => type.slug === slug);
  if (!match) return slug;
  return locale === "ar" ? match.name_ar : match.name_en;
}
