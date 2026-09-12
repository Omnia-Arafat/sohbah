"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const MAX_NAME = 120;

/**
 * Creating and editing a curriculum is open to any approved معلمة, not just a
 * مشرفة: the person who prepares the lesson is the one who knows which حديث
 * comes next, and making her wait on a supervisor to type it in is how these
 * lists end up empty. Deleting stays with a مشرفة — it cascades to every unit
 * and is the one action here that cannot be undone.
 *
 * `curricula_insert_staff` / `curricula_delete_supervisor` enforce both rules
 * in the database. These checks decide what to *show* and fail early with a
 * clear message; the policies are what actually hold.
 */

export type CurriculumFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: { nameAr: string; nameEn: string; circleType: string; description: string };
      fieldErrors: Partial<Record<"nameAr" | "nameEn" | "circleType", string>>;
    }
  | {
      status: "failed";
      values: { nameAr: string; nameEn: string; circleType: string; description: string };
      reason: string;
    };

function refresh(academySlug: string) {
  revalidatePath(`/${academySlug}/admin/curricula`);
}

export async function createCurriculum(
  _previous: CurriculumFormState,
  formData: FormData,
): Promise<CurriculumFormState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const nameAr = String(formData.get("nameAr") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim();
  const circleType = String(formData.get("circleType") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const values = { nameAr, nameEn, circleType, description };

  const fieldErrors: Partial<Record<"nameAr" | "nameEn" | "circleType", string>> = {};
  if (!nameAr) fieldErrors.nameAr = "required";
  else if (nameAr.length > MAX_NAME) fieldErrors.nameAr = "tooLong";
  if (!nameEn) fieldErrors.nameEn = "required";
  else if (nameEn.length > MAX_NAME) fieldErrors.nameEn = "tooLong";
  if (!circleType) fieldErrors.circleType = "required";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireStaffSession(`/${academySlug}/admin/curricula`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.from("curricula").insert({
    academy_id: academy.id,
    circle_type: circleType,
    name_ar: nameAr,
    name_en: nameEn,
    description: description || null,
  });

  if (error) {
    console.error("curriculum insert failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  refresh(academySlug);
  return { status: "idle" };
}

/** Retiring a curriculum without destroying it — the reversible counterpart. */
export async function setCurriculumActive(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const curriculumId = String(formData.get("curriculumId") ?? "");
  const isActive = formData.get("isActive") === "1";

  await requireStaffSession(`/${academySlug}/admin/curricula`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("curricula")
    .update({ is_active: isActive })
    .eq("id", curriculumId)
    .eq("academy_id", academy.id);

  if (error) console.error("curriculum activation failed", error);
  refresh(academySlug);
}

/**
 * Deletes a curriculum and, by cascade, every unit under it. Withheld from a
 * معلمة in the UI and refused by `curricula_delete_supervisor` regardless.
 */
export async function deleteCurriculum(formData: FormData) {
  const academySlug = String(formData.get("academySlug") ?? "");
  const curriculumId = String(formData.get("curriculumId") ?? "");

  const session = await requireStaffSession(`/${academySlug}/admin/curricula`);
  if (!canSupervise(session.teacher)) return;

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("curricula")
    .delete()
    .eq("id", curriculumId)
    .eq("academy_id", academy.id);

  if (error) console.error("curriculum delete failed", error);
  refresh(academySlug);
}
