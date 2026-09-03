"use server";

import { revalidatePath } from "next/cache";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import type { GenderCategory } from "@/lib/database.types";
import { normalizeSessionLink } from "@/lib/circle-link";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type CircleFormValues = {
  name: string;
  type: string;
  gender_category: string;
  teacher_id: string;
  session_link: string;
  start_time: string;
  duration_minutes: number;
  days_of_week: number[];
  status: string;
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

  // Check authorization
  const session = await getTeacherSession();
  if (!isActiveTeacher(session) || session.teacher.role !== "admin") {
    return { status: "error", message: "unauthorized" };
  }

  // Verify academy
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    return { status: "error", message: "academyNotFound" };
  }

  // Read form values
  const name = formData.get("name")?.toString().trim() || "";
  const type = formData.get("type")?.toString() || "";
  const gender = formData.get("gender")?.toString() || "";
  const teacher_id = formData.get("teacher_id")?.toString() || "";
  const sessionLink = formData.get("sessionLink")?.toString().trim() || "";
  // A native time input normally submits HH:MM, but normalize defensively in
  // case a browser sends the seconds included in PostgreSQL's `time` value.
  const startTime = (formData.get("startTime")?.toString() || "").slice(0, 5);
  const duration = formData.get("duration")?.toString() || "";
  const status = formData.get("status")?.toString() || "active";
  const days = formData
    .getAll("days")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  // Validate
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "nameRequired";
  else if (name.length > 120) fieldErrors.name = "tooLong";

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

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "invalid",
      values: {
        name,
        type,
        gender_category: gender,
        teacher_id,
        session_link: sessionLink,
        start_time: startTime,
        duration_minutes: durationNum,
        days_of_week: days,
        status,
      },
      fieldErrors,
    };
  }

  // Update in database
  const supabase = await createClient();
  
  const { data: updatedCircle, error } = await supabase
    .from("circles")
    .update({
      name,
      type,
      gender_category: gender as GenderCategory,
      teacher_id,
      session_link: normalizeSessionLink(sessionLink),
      start_time: startTime,
      duration_minutes: durationNum,
      days_of_week: days.slice().sort((a, b) => a - b),
      is_active: status === "active",
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
          name,
          type,
          gender_category: gender,
          teacher_id,
          session_link: sessionLink,
          start_time: startTime,
          duration_minutes: durationNum,
          days_of_week: days,
          status,
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
