"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const MAX_TITLE = 200;

/**
 * A unit is one حديث, or one باب من المتن.
 *
 * The Hadith-shaped fields (narrator / source / grade) are all optional, which
 * is what lets the same form serve a tajweed curriculum: the معلمة simply
 * leaves them blank and the screen shows the sections she filled in.
 */

type UnitValues = {
  titleAr: string;
  titleEn: string;
  body: string;
  explanation: string;
  narrator: string;
  sourceBook: string;
  sourceRef: string;
  grade: string;
};

export type UnitFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: UnitValues;
      fieldErrors: Partial<Record<"titleAr" | "titleEn", string>>;
    }
  | { status: "failed"; values: UnitValues; reason: string };

function readUnit(formData: FormData): UnitValues {
  return {
    titleAr: String(formData.get("titleAr") ?? "").trim(),
    titleEn: String(formData.get("titleEn") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    explanation: String(formData.get("explanation") ?? "").trim(),
    narrator: String(formData.get("narrator") ?? "").trim(),
    sourceBook: String(formData.get("sourceBook") ?? "").trim(),
    sourceRef: String(formData.get("sourceRef") ?? "").trim(),
    grade: String(formData.get("grade") ?? "").trim(),
  };
}

function validate(values: UnitValues) {
  const fieldErrors: Partial<Record<"titleAr" | "titleEn", string>> = {};
  if (!values.titleAr) fieldErrors.titleAr = "required";
  else if (values.titleAr.length > MAX_TITLE) fieldErrors.titleAr = "tooLong";
  if (!values.titleEn) fieldErrors.titleEn = "required";
  else if (values.titleEn.length > MAX_TITLE) fieldErrors.titleEn = "tooLong";
  return fieldErrors;
}

/** Null rather than '' so an untouched optional field reads as absent. */
function orNull(value: string) {
  return value || null;
}

export async function createUnit(
  _previous: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const curriculumId = String(formData.get("curriculumId") ?? "").trim();
  const values = readUnit(formData);

  const fieldErrors = validate(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireStaffSession(`/${academySlug}/admin/curricula/${curriculumId}`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();

  // The curriculum must belong to this academy. RLS would refuse the insert
  // anyway (the unit policies reach through to the parent's academy), but
  // checking here turns a silent failure into a reportable one.
  const { data: curriculum } = await supabase
    .from("curricula")
    .select("id")
    .eq("id", curriculumId)
    .eq("academy_id", academy.id)
    .maybeSingle();

  if (!curriculum) return { status: "failed", values, reason: "generic" };

  // Append at the end. Two معلمتان adding at once can collide on
  // (curriculum_id, position) — the unique constraint is what catches it, and
  // the caller simply tries again, which is cheaper than locking the table for
  // an action this rare.
  const { data: last } = await supabase
    .from("curriculum_units")
    .select("position")
    .eq("curriculum_id", curriculumId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("curriculum_units").insert({
    curriculum_id: curriculumId,
    position: (last?.position ?? 0) + 1,
    title_ar: values.titleAr,
    title_en: values.titleEn,
    body: orNull(values.body),
    explanation: orNull(values.explanation),
    narrator: orNull(values.narrator),
    source_book: orNull(values.sourceBook),
    source_ref: orNull(values.sourceRef),
    grade: orNull(values.grade),
  });

  if (error) {
    console.error("unit insert failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  revalidatePath(`/${academySlug}/admin/curricula/${curriculumId}`);
  return { status: "idle" };
}

export async function updateUnit(
  _previous: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const curriculumId = String(formData.get("curriculumId") ?? "").trim();
  const unitId = String(formData.get("unitId") ?? "").trim();
  const values = readUnit(formData);

  const fieldErrors = validate(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireStaffSession(`/${academySlug}/admin/curricula/${curriculumId}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("curriculum_units")
    .update({
      title_ar: values.titleAr,
      title_en: values.titleEn,
      body: orNull(values.body),
      explanation: orNull(values.explanation),
      narrator: orNull(values.narrator),
      source_book: orNull(values.sourceBook),
      source_ref: orNull(values.sourceRef),
      grade: orNull(values.grade),
    })
    .eq("id", unitId)
    .eq("curriculum_id", curriculumId);

  if (error) {
    console.error("unit update failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  revalidatePath(`/${academySlug}/admin/curricula/${curriculumId}`);
  return { status: "idle" };
}

/**
 * Moves a unit one place up or down by swapping positions with its neighbour.
 *
 * `uq_unit_position` is deferrable so a permutation can happen inside one
 * transaction — but supabase-js sends each update as its own statement, so
 * there is no transaction to defer to here and the constraint is checked after
 * every one of them. The swap therefore parks a row above the last position
 * first, so no two rows ever hold the same one.
 */
export async function moveUnit(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const curriculumId = String(formData.get("curriculumId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const direction = formData.get("direction") === "up" ? "up" : "down";

  await requireStaffSession(`/${academySlug}/admin/curricula/${curriculumId}`);

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("curriculum_units")
    .select("id, position")
    .eq("curriculum_id", curriculumId)
    .order("position");

  if (!units) return;

  const index = units.findIndex((unit) => unit.id === unitId);
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= units.length) return;

  const current = units[index];
  const other = units[otherIndex];

  // Park one row out of the way first so no two rows ever share a position.
  // Above the last one rather than below zero: `position` carries a
  // `check (position > 0)`, so a negative parking slot would be refused.
  const parking = units[units.length - 1].position + 1;
  await supabase
    .from("curriculum_units")
    .update({ position: parking })
    .eq("id", current.id);
  await supabase
    .from("curriculum_units")
    .update({ position: current.position })
    .eq("id", other.id);
  await supabase
    .from("curriculum_units")
    .update({ position: other.position })
    .eq("id", current.id);

  revalidatePath(`/${academySlug}/admin/curricula/${curriculumId}`);
}

/** مشرفة only, like deleting the curriculum itself. */
export async function deleteUnit(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const curriculumId = String(formData.get("curriculumId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");

  const session = await requireStaffSession(
    `/${academySlug}/admin/curricula/${curriculumId}`,
  );
  if (!canSupervise(session.teacher)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("curriculum_units")
    .delete()
    .eq("id", unitId)
    .eq("curriculum_id", curriculumId);

  if (error) console.error("unit delete failed", error);

  revalidatePath(`/${academySlug}/admin/curricula/${curriculumId}`);
}
