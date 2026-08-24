"use server";

import { revalidatePath } from "next/cache";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import type { CircleType, GenderCategory } from "@/lib/database.types";
import { normalizeSessionLink } from "@/lib/circle-link";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";

const CIRCLE_TYPES: CircleType[] = ["tasheeh", "tajweed", "free_recitation"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type UpdateCircleState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "invalid"; values: any; fieldErrors: Record<string, string> };

export async function updateCircle(
  _previous: UpdateCircleState,
  formData: FormData,
): Promise<UpdateCircleState> {
  const circleId = formData.get("circleId")?.toString();
  const academySlug = formData.get("academySlug")?.toString();
  
  if (!circleId || !academySlug) {
    return { status: "error", message: "Missing required parameters" };
  }

  // Check authorization
  const session = await getTeacherSession();
  if (!isActiveTeacher(session) || session.teacher.role !== "admin") {
    return { status: "error", message: "Unauthorized" };
  }

  // Verify academy
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    return { status: "error", message: "Academy not found" };
  }

  // Read form values
  const name = formData.get("name")?.toString().trim() || "";
  const type = formData.get("type")?.toString() || "";
  const gender = formData.get("gender")?.toString() || "";
  const teacher_id = formData.get("teacher_id")?.toString() || "";
  const sessionLink = formData.get("sessionLink")?.toString().trim() || "";
  const startTime = formData.get("startTime")?.toString() || "";
  const duration = formData.get("duration")?.toString() || "";
  const status = formData.get("status")?.toString() || "active";
  const days = formData
    .getAll("days")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  // Validate
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "Name is required";
  else if (name.length > 120) fieldErrors.name = "Name is too long";

  if (!CIRCLE_TYPES.includes(type as CircleType)) {
    fieldErrors.type = "Invalid circle type";
  }

  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "Gender is required";
  }

  if (!teacher_id) {
    fieldErrors.teacher_id = "Teacher is required";
  }

  if (!sessionLink) {
    fieldErrors.sessionLink = "Session link is required";
  } else {
    const normalizedLink = normalizeSessionLink(sessionLink);
    try {
      const url = new URL(normalizedLink);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        fieldErrors.sessionLink = "Invalid URL protocol";
      }
    } catch {
      fieldErrors.sessionLink = "Invalid URL";
    }
  }

  if (!TIME_PATTERN.test(startTime)) {
    fieldErrors.startTime = "Invalid time format";
  }

  const durationNum = Number(duration);
  if (!Number.isInteger(durationNum) || durationNum < 5 || durationNum > 480) {
    fieldErrors.duration = "Duration must be between 5 and 480 minutes";
  }

  if (days.length === 0) {
    fieldErrors.days = "Select at least one day";
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
  
  const { error } = await supabase
    .from("circles")
    .update({
      name,
      type: type as CircleType,
      gender_category: gender as GenderCategory,
      teacher_id,
      session_link: normalizeSessionLink(sessionLink),
      start_time: startTime,
      duration_minutes: durationNum,
      days_of_week: days.slice().sort((a, b) => a - b),
      is_active: status === "active",
    })
    .eq("id", circleId)
    .eq("academy_id", academy.id);

  if (error) {
    console.error("Failed to update circle:", error);
    return { status: "error", message: "Failed to save changes" };
  }

  revalidatePath(`/${academySlug}/admin/circles`);
  revalidatePath(`/${academySlug}/admin/circles/${circleId}/edit`);
  
  return { status: "success", message: "Changes saved successfully" };
}
