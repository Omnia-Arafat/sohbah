"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import type { CircleType, GenderCategory } from "@/lib/database.types";
import { normalizeSessionLink } from "@/lib/circle-link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import type { CircleFieldErrors, CircleValues, NewCircleState } from "./state";

const CIRCLE_TYPES: CircleType[] = ["tasheeh", "tajweed", "free_recitation"];
const SLUG_PATTERN = /^halaqa-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function readValues(formData: FormData): CircleValues {
  const read = (key: string) => String(formData.get(key) ?? "").trim();

  return {
    name: read("name"),
    type: read("type"),
    gender: read("gender"),
    sessionLink: read("sessionLink"),
    timezone: read("timezone"),
    startTime: read("startTime"),
    duration: read("duration"),
    days: formData
      .getAll("days")
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  };
}

function validate(values: CircleValues): CircleFieldErrors {
  const errors: CircleFieldErrors = {};

  if (!values.name) errors.name = "nameRequired";
  else if (values.name.length > 120) errors.name = "tooLong";

  if (!CIRCLE_TYPES.includes(values.type as CircleType)) {
    errors.type = "typeRequired";
  }

  if (values.gender !== "male" && values.gender !== "female") {
    errors.gender = "genderRequired";
  }

  if (!values.sessionLink) {
    errors.sessionLink = "linkRequired";
  } else {
    const normalizedLink = normalizeSessionLink(values.sessionLink);
    try {
      const url = new URL(normalizedLink);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.sessionLink = "linkInvalid";
      }
    } catch {
      errors.sessionLink = "linkInvalid";
    }
  }

  if (!values.timezone) errors.timezone = "timezoneRequired";
  if (!TIME_PATTERN.test(values.startTime)) errors.startTime = "startTimeInvalid";

  const duration = Number(values.duration);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    errors.duration = "durationInvalid";
  }

  if (values.days.length === 0) errors.days = "daysRequired";

  return errors;
}

export async function createCircle(
  registrationSlug: string,
  _previous: NewCircleState,
  formData: FormData,
): Promise<NewCircleState> {
  const values = readValues(formData);
  const academySlug = String(formData.get("academySlug") ?? "").trim();

  const fieldErrors = validate(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { status: "failed", values, reason: "notConfigured" };
  }

  const session = await getTeacherSession();
  if (!isActiveTeacher(session)) {
    return { status: "failed", values, reason: "forbidden" };
  }

  if (!SLUG_PATTERN.test(registrationSlug)) {
    return { status: "failed", values, reason: "generic" };
  }

  // Get academy id
  const academy = academySlug ? await getAcademyBySlug(academySlug) : null;
  if (!academy) {
    return { status: "failed", values, reason: "generic" };
  }

  const sessionLink = normalizeSessionLink(values.sessionLink);

  const supabase = await createClient();
  const { data: createdCircle, error } = await supabase
    .from("circles")
    .insert({
      teacher_id: session.teacher.id,
      academy_id: academy.id,
      name: values.name,
      type: values.type as CircleType,
      gender_category: values.gender as GenderCategory,
      session_link: sessionLink,
      timezone: values.timezone,
      start_time: values.startTime,
      duration_minutes: Number(values.duration),
      days_of_week: values.days.slice().sort((a, b) => a - b),
      registration_slug: registrationSlug,
    })
    .select("registration_slug")
    .single();

  if (error || createdCircle?.registration_slug !== registrationSlug) {
    console.error("circle insert failed", error);
    const reason =
      error?.code === "23505"
        ? "slugTaken"
        : error?.code === "22023"
          ? "timezoneInvalid"
          : error?.code === "42501"
            ? "forbidden"
            : "generic";
    return { status: "failed", values, reason };
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/${academySlug}/dashboard`);
  return redirect({ href: `/${academySlug}/dashboard`, locale });
}
