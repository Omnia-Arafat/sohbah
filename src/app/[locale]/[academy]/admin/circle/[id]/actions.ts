"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { isAdmin, requireAdminSession } from "@/lib/auth/dal";
import type { CircleType, GenderCategory } from "@/lib/database.types";
import { normalizeSessionLink } from "@/lib/circle-link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const CIRCLE_TYPES: CircleType[] = ["tasheeh", "tajweed", "free_recitation"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type EditCircleValues = {
  name: string;
  type: string;
  gender: string;
  sessionLink: string;
  timezone: string;
  startTime: string;
  duration: string;
  days: number[];
  isActive: boolean;
};

export type EditCircleFieldErrors = Partial<Record<keyof EditCircleValues, string>>;

export type EditCircleState =
  | { status: "idle" }
  | {
      status: "invalid";
      values: EditCircleValues;
      fieldErrors: EditCircleFieldErrors;
    }
  | { status: "failed"; values: EditCircleValues; reason: string };

export const initialEditCircleState: EditCircleState = { status: "idle" };

function readValues(formData: FormData): EditCircleValues {
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
    isActive: formData.get("isActive") === "on",
  };
}

function validate(values: EditCircleValues): EditCircleFieldErrors {
  const errors: EditCircleFieldErrors = {};

  if (!values.name) errors.name = "nameRequired";
  else if (values.name.length > 120) errors.name = "tooLong";

  if (!CIRCLE_TYPES.includes(values.type as CircleType)) errors.type = "typeRequired";

  if (values.gender !== "male" && values.gender !== "female") {
    errors.gender = "genderRequired";
  }

  if (!values.sessionLink) {
    errors.sessionLink = "linkRequired";
  } else {
    try {
      const url = new URL(normalizeSessionLink(values.sessionLink));
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

export async function updateCircle(
  circleId: string,
  _previous: EditCircleState,
  formData: FormData,
): Promise<EditCircleState> {
  const values = readValues(formData);
  const fieldErrors = validate(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { status: "failed", values, reason: "notConfigured" };
  }

  const session = await requireAdminSession(`/admin/circle/${circleId}/edit`);
  if (!isAdmin(session)) {
    return { status: "failed", values, reason: "forbidden" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("circles")
    .update({
      name: values.name,
      type: values.type as CircleType,
      gender_category: values.gender as GenderCategory,
      session_link: normalizeSessionLink(values.sessionLink),
      timezone: values.timezone,
      start_time: values.startTime,
      duration_minutes: Number(values.duration),
      days_of_week: values.days.slice().sort((a, b) => a - b),
      is_active: values.isActive,
    })
    .eq("id", circleId);

  if (error) {
    console.error("admin circle update failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  const locale = await getLocale();
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/circle/${circleId}/edit`);
  return redirect({ href: "/admin", locale });
}

export async function deleteCircle(circleId: string) {
  if (!isSupabaseConfigured()) {
    return { status: "failed", reason: "notConfigured" as const };
  }

  const session = await requireAdminSession(`/admin/circle/${circleId}/edit`);
  if (!isAdmin(session)) {
    return { status: "failed", reason: "forbidden" as const };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("circles")
    .update({ is_active: false })
    .eq("id", circleId);

  if (error) {
    console.error("admin circle delete failed", error);
    return { status: "failed", reason: "generic" as const };
  }

  const locale = await getLocale();
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/circle/${circleId}/edit`);
  return redirect({ href: "/admin", locale });
}
