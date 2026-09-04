"use server";

import { revalidatePath } from "next/cache";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import type { GenderCategory } from "@/lib/database.types";
import { normalizeSessionLink } from "@/lib/circle-link";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type CircleFormValues = {
  type: string;
  gender_category: string;
  teacher_id: string;
  session_link: string;
  start_time: string;
  duration_minutes: number;
  days_of_week: number[];
  status: string;
  max_students: number | null;
};

export type UpdateCircleState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "invalid"; values: CircleFormValues; fieldErrors: Record<string, string> };

export async function updateCircle(
  _previous: UpdateCircleState,
  formData: FormData,
): Promise<UpdateCircleState> {
  const circleId = formData.get("circleId")?.toString();
  const academySlug = formData.get("academySlug")?.toString();
  const locale = formData.get("locale")?.toString();
  
  if (!circleId || !academySlug || !locale) {
    return { status: "error", message: "missingParams" };
  }

  // Any approved teacher or supervisor may edit any circle in the academy —
  // the academy asked for this while a real supervisor role does not exist
  // yet. Being approved is still required, and `circles_update_staff` in the
  // database enforces the same rule independently of this check.
  const session = await getTeacherSession();
  if (!isActiveTeacher(session)) {
    return { status: "error", message: "unauthorized" };
  }

  // Verify academy
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    return { status: "error", message: "academyNotFound" };
  }

  const supabase = await createClient();

  // Read form values
  const type = formData.get("type")?.toString() || "";
  const gender = formData.get("gender")?.toString() || "";
  const teacher_id = formData.get("teacher_id")?.toString() || "";
  const sessionLink = formData.get("sessionLink")?.toString().trim() || "";
  // A native time input normally submits HH:MM, but normalize defensively in
  // case a browser sends the seconds included in PostgreSQL's `time` value.
  const startTime = (formData.get("startTime")?.toString() || "").slice(0, 5);
  const duration = formData.get("duration")?.toString() || "";
  const status = formData.get("status")?.toString() || "active";
  const maxStudentsRaw = formData.get("maxStudents")?.toString().trim() || "";
  const days = formData
    .getAll("days")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  // Validate
  const fieldErrors: Record<string, string> = {};

  // Format only — whether the slug is a real, active type for this academy is
  // enforced by `fk_circles_type` at update time (see the catch below), since
  // the valid set is now academy-managed rather than fixed in code.
  if (!type) fieldErrors.type = "typeRequired";

  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "genderRequired";
  }

  if (!teacher_id) {
    fieldErrors.teacher_id = "teacherRequired";
  }

  // The circle's name is derived from whoever owns it — see the note in
  // dashboard/new/state.ts — so a valid teacher_id doubles as validating the
  // name. Looked up now rather than after the other checks so it is ready for
  // both the success path and the fk_circles_type catch below.
  let ownerName: string | null = null;
  if (teacher_id) {
    const { data: owner } = await supabase
      .from("teachers")
      .select("name")
      .eq("id", teacher_id)
      .eq("academy_id", academy.id)
      .maybeSingle();

    if (!owner) {
      fieldErrors.teacher_id = "teacherRequired";
    } else {
      ownerName = owner.name;
    }
  }

  if (!sessionLink) {
    fieldErrors.sessionLink = "linkRequired";
  } else {
    const normalizedLink = normalizeSessionLink(sessionLink);
    try {
      const url = new URL(normalizedLink);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        fieldErrors.sessionLink = "linkInvalid";
      }
    } catch {
      fieldErrors.sessionLink = "linkInvalid";
    }
  }

  if (!TIME_PATTERN.test(startTime)) {
    fieldErrors.startTime = "startTimeInvalid";
  }

  const durationNum = Number(duration);
  if (!Number.isInteger(durationNum) || durationNum < 5 || durationNum > 480) {
    fieldErrors.duration = "durationInvalid";
  }

  if (days.length === 0) {
    fieldErrors.days = "daysRequired";
  }

  // Blank means unlimited, so only validate a number that was actually typed.
  let maxStudents: number | null = null;
  if (maxStudentsRaw) {
    maxStudents = Number(maxStudentsRaw);
    if (!Number.isInteger(maxStudents) || maxStudents < 1 || maxStudents > 500) {
      fieldErrors.maxStudents = "maxStudentsInvalid";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "invalid",
      values: {
        type,
        gender_category: gender,
        teacher_id,
        session_link: sessionLink,
        start_time: startTime,
        duration_minutes: durationNum,
        days_of_week: days,
        status,
        max_students: maxStudentsRaw ? maxStudents : null,
      },
      fieldErrors,
    };
  }

  // Reached only once fieldErrors is empty, so the teacher_id lookup above
  // already succeeded — this is a type-narrowing formality, not a real check.
  if (!ownerName) {
    return { status: "error", message: "saveFailed" };
  }

  // Update in database
  const { data: updatedCircle, error } = await supabase
    .from("circles")
    .update({
      name: ownerName,
      type,
      gender_category: gender as GenderCategory,
      teacher_id,
      session_link: normalizeSessionLink(sessionLink),
      start_time: startTime,
      duration_minutes: durationNum,
      days_of_week: days.slice().sort((a, b) => a - b),
      is_active: status === "active",
      max_students: maxStudents,
    })
    .eq("id", circleId)
    .eq("academy_id", academy.id)
    .select("id")
    .maybeSingle();

  if (error || !updatedCircle) {
    console.error("Failed to update circle:", error);

    // fk_circles_type: the type was deactivated between the page loading and
    // this submit. Reported on the field, since to the admin it is the same
    // fix as leaving it empty — pick a type again.
    if (error?.code === "23503") {
      return {
        status: "invalid",
        values: {
          type,
          gender_category: gender,
          teacher_id,
          session_link: sessionLink,
          start_time: startTime,
          duration_minutes: durationNum,
          days_of_week: days,
          status,
          max_students: maxStudents,
        },
        fieldErrors: { type: "typeRequired" },
      };
    }

    return { status: "error", message: "saveFailed" };
  }

  revalidatePath(`/${locale}/${academySlug}/admin/circles`);
  revalidatePath(`/${locale}/${academySlug}/admin/circles/${circleId}/edit`);
  
  return { status: "success", message: "saved" };
}
