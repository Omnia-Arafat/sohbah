"use server";

import { revalidatePath } from "next/cache";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import type { ScheduleBoard } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const MAX_TITLE = 120;
const MAX_NOTE = 400;

type BoardValues = {
  titleAr: string;
  titleEn: string;
  circleType: string;
  gender: string;
  startFrom: string;
  startTo: string;
  noteAr: string;
  noteEn: string;
  displayOrder: string;
};

type BoardField = keyof BoardValues;

export type ScheduleBoardState =
  | { status: "idle" }
  | { status: "invalid"; values: BoardValues; fieldErrors: Partial<Record<BoardField, string>> }
  | { status: "failed"; values: BoardValues; reason: string };

function readValues(formData: FormData): BoardValues {
  return {
    titleAr: String(formData.get("titleAr") ?? "").trim(),
    titleEn: String(formData.get("titleEn") ?? "").trim(),
    circleType: String(formData.get("circleType") ?? "").trim(),
    gender: String(formData.get("gender") ?? "").trim(),
    startFrom: String(formData.get("startFrom") ?? "").trim(),
    startTo: String(formData.get("startTo") ?? "").trim(),
    noteAr: String(formData.get("noteAr") ?? "").trim(),
    noteEn: String(formData.get("noteEn") ?? "").trim(),
    displayOrder: String(formData.get("displayOrder") ?? "0").trim(),
  };
}

function validate(values: BoardValues): Partial<Record<BoardField, string>> {
  const fieldErrors: Partial<Record<BoardField, string>> = {};

  if (!values.titleAr) fieldErrors.titleAr = "required";
  else if (values.titleAr.length > MAX_TITLE) fieldErrors.titleAr = "tooLong";
  if (!values.titleEn) fieldErrors.titleEn = "required";
  else if (values.titleEn.length > MAX_TITLE) fieldErrors.titleEn = "tooLong";
  if (!values.circleType) fieldErrors.circleType = "required";
  if (values.noteAr.length > MAX_NOTE) fieldErrors.noteAr = "tooLong";
  if (values.noteEn.length > MAX_NOTE) fieldErrors.noteEn = "tooLong";
  // Caught here as well as by the table's own CHECK so the admin gets the
  // message on the field rather than a failed save with no explanation.
  if (values.startFrom && values.startTo && values.startFrom > values.startTo) {
    fieldErrors.startTo = "timeOrder";
  }

  return fieldErrors;
}

/** The form's own fields, shaped for the row. Empty note/gender mean "unset". */
function toRow(
  values: BoardValues,
  academyId: string,
): Omit<ScheduleBoard, "id" | "created_at" | "is_published"> {
  const gender = values.gender;
  return {
    academy_id: academyId,
    circle_type: values.circleType,
    gender_category: gender === "male" || gender === "female" ? gender : null,
    start_from: values.startFrom || null,
    start_to: values.startTo || null,
    title_ar: values.titleAr,
    title_en: values.titleEn,
    note_ar: values.noteAr || null,
    note_en: values.noteEn || null,
    display_order: Number.parseInt(values.displayOrder, 10) || 0,
  };
}

function refresh(academySlug: string) {
  revalidatePath(`/${academySlug}/admin/schedules`);
  revalidatePath(`/${academySlug}/schedule`);
}

export async function createScheduleBoard(
  _previous: ScheduleBoardState,
  formData: FormData,
): Promise<ScheduleBoardState> {
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const values = readValues(formData);
  const fieldErrors = validate(values);

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireAdminSession(`/${academySlug}/admin/schedules`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_boards")
    .insert(toRow(values, academy.id));

  if (error) {
    console.error("schedule board insert failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  refresh(academySlug);
  return { status: "idle" };
}

export async function updateScheduleBoard(
  _previous: ScheduleBoardState,
  formData: FormData,
): Promise<ScheduleBoardState> {
  const boardId = String(formData.get("boardId") ?? "");
  const academySlug = String(formData.get("academySlug") ?? "").trim();
  const values = readValues(formData);
  const fieldErrors = validate(values);

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  await requireAdminSession(`/${academySlug}/admin/schedules`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return { status: "failed", values, reason: "generic" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_boards")
    .update(toRow(values, academy.id))
    .eq("id", boardId)
    .eq("academy_id", academy.id);

  if (error) {
    console.error("schedule board update failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  refresh(academySlug);
  return { status: "idle" };
}

/**
 * Publishing is what puts a board on the public page; unpublishing is the
 * reversible way to pull one down without losing how it was set up.
 */
export async function setScheduleBoardPublished(formData: FormData) {
  const boardId = String(formData.get("boardId") ?? "");
  const isPublished = formData.get("isPublished") === "1";
  const academySlug = String(formData.get("academySlug") ?? "");

  await requireAdminSession(`/${academySlug}/admin/schedules`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_boards")
    .update({ is_published: isPublished })
    .eq("id", boardId)
    .eq("academy_id", academy.id);

  if (error) console.error("schedule board publish toggle failed", error);

  refresh(academySlug);
}

/**
 * Deleting a board removes the table, never the circles inside it — a board
 * holds no circle data of its own, only the title and scope it renders under.
 */
export async function deleteScheduleBoard(formData: FormData) {
  const boardId = String(formData.get("boardId") ?? "");
  const academySlug = String(formData.get("academySlug") ?? "");

  await requireAdminSession(`/${academySlug}/admin/schedules`);
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_boards")
    .delete()
    .eq("id", boardId)
    .eq("academy_id", academy.id);

  if (error) console.error("schedule board delete failed", error);

  refresh(academySlug);
}
