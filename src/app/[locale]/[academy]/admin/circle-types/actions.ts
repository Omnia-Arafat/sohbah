"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const MAX_NAME = 80;
const UNIQUE_VIOLATION = "23505";

export type CreateCircleTypeState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: { nameAr: string; nameEn: string };
      fieldErrors: Partial<Record<"nameAr" | "nameEn", string>>;
    }
  | { status: "failed"; values: { nameAr: string; nameEn: string }; reason: string };

/**
 * Turns a name into the internal reference key stored in `circle_types.slug`.
 * The admin never sees this — it exists only so `circles.type` has something
 * short and ASCII to store and to join on — so no attempt is made to
 * transliterate Arabic into it; an Arabic-only name just falls back to a
 * random key, which is exactly as good a join key as any other.
 */
function slugify(nameEn: string): string {
  const base = nameEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics from a Latin name
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return base.length >= 2 ? base : randomSlug();
}

function randomSlug(): string {
  return `type_${Math.random().toString(36).slice(2, 8)}`;
}

function refresh(academySlug: string) {
  revalidatePath(`/${academySlug}/admin/circle-types`);
  revalidatePath(`/${academySlug}/dashboard/new`);
  revalidatePath(`/${academySlug}/admin/circles`);
}

/**
 * Adds a circle type for this academy.
 *
 * A brand-new type carries its own bilingual name rather than an i18n key —
 * see `circleTypeLabel()` — so both `nameAr` and `nameEn` are required even
 * though the form only asks the admin to fill in one language pair, not pick
 * a code.
 */
export async function createCircleType(
  _previous: CreateCircleTypeState,
  formData: FormData,
): Promise<CreateCircleTypeState> {
  const nameAr = String(formData.get("nameAr") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const values = { nameAr, nameEn };

  const fieldErrors: Partial<Record<"nameAr" | "nameEn", string>> = {};
  if (!nameAr) fieldErrors.nameAr = "required";
  else if (nameAr.length > MAX_NAME) fieldErrors.nameAr = "tooLong";
  if (!nameEn) fieldErrors.nameEn = "required";
  else if (nameEn.length > MAX_NAME) fieldErrors.nameEn = "tooLong";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireAdminSession(`/${academySlug}/admin/circle-types`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();
  const base = slugify(nameEn);

  // Collision on the (academy_id, slug) key is rare — two names deriving the
  // same ASCII base — so a short bounded retry is simpler than checking first
  // and racing another admin doing the same thing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}_${attempt + 1}`;

    const { error } = await supabase.from("circle_types").insert({
      academy_id: academy.id,
      slug,
      name_ar: nameAr,
      name_en: nameEn,
    });

    if (!error) {
      refresh(academySlug);
      return { status: "idle" };
    }

    if (error.code !== UNIQUE_VIOLATION) {
      console.error("circle type insert failed", error);
      return { status: "failed", values, reason: "generic" };
    }
    // Unique violation on the slug — loop and retry with a suffixed one.
  }

  return { status: "failed", values, reason: "generic" };
}

/**
 * Activates or deactivates a type. Deactivating hides it from new circles;
 * circles already using it are unaffected — it stays the reversible way to
 * retire a type, alongside the real delete below.
 */
export async function setCircleTypeActive(formData: FormData) {
  const typeId = String(formData.get("typeId") ?? "");
  const isActive = formData.get("isActive") === "1";
  const academySlug = String(formData.get("academySlug") ?? "");

  await requireAdminSession(`/${academySlug}/admin/circle-types`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("circle_types")
    .update({ is_active: isActive })
    .eq("id", typeId)
    .eq("academy_id", academy.id);

  if (error) console.error("circle type activation failed", error);

  refresh(academySlug);
}

export type UpdateCircleTypeState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: { nameAr: string; nameEn: string };
      fieldErrors: Partial<Record<"nameAr" | "nameEn", string>>;
    }
  | { status: "error"; message: string };

/**
 * Renames a type. The slug — the internal key `circles.type` actually
 * stores — never changes, so every circle already using this type keeps
 * pointing at the same row; only the displayed name changes for them too.
 */
export async function updateCircleType(
  _previous: UpdateCircleTypeState,
  formData: FormData,
): Promise<UpdateCircleTypeState> {
  const typeId = String(formData.get("typeId") ?? "");
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const nameAr = String(formData.get("nameAr") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const values = { nameAr, nameEn };

  const fieldErrors: Partial<Record<"nameAr" | "nameEn", string>> = {};
  if (!nameAr) fieldErrors.nameAr = "required";
  else if (nameAr.length > MAX_NAME) fieldErrors.nameAr = "tooLong";
  if (!nameEn) fieldErrors.nameEn = "required";
  else if (nameEn.length > MAX_NAME) fieldErrors.nameEn = "tooLong";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireAdminSession(`/${academySlug}/admin/circle-types`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "error", message: "generic" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("circle_types")
    .update({ name_ar: nameAr, name_en: nameEn })
    .eq("id", typeId)
    .eq("academy_id", academy.id);

  if (error) {
    console.error("circle type update failed", error);
    return { status: "error", message: "generic" };
  }

  refresh(academySlug);
  return { status: "idle" };
}

/**
 * Permanently removes a type that no circle uses.
 *
 * `fk_circles_type` has no ON DELETE clause, so Postgres defaults to
 * RESTRICT: a type still referenced by any circle cannot be deleted no matter
 * what this does — the database refuses it outright. The page additionally
 * withholds the button in that case so nobody discovers the rule by hitting
 * an error, but this catch is the real, server-side edge — the button being
 * hidden is only a courtesy.
 */
export async function deleteCircleType(formData: FormData) {
  const typeId = String(formData.get("typeId") ?? "");
  const academySlug = String(formData.get("academySlug") ?? "");

  await requireAdminSession(`/${academySlug}/admin/circle-types`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("circle_types")
    .delete()
    .eq("id", typeId)
    .eq("academy_id", academy.id);

  if (error) console.error("circle type delete failed", error);

  refresh(academySlug);
}
