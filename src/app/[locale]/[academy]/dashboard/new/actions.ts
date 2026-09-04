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

const SLUG_PATTERN = /^halaqa-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function readValues(formData: FormData): CircleValues {
  const read = (key: string) => String(formData.get(key) ?? "").trim();

  return {
    teacherId: read("teacherId"),
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

  // Format only — whether the slug is a real, active type for this academy is
  // enforced by `fk_circles_type` at insert time (see the catch below), since
  // the valid set is now academy-managed rather than fixed in code.
  if (!values.type) errors.type = "typeRequired";

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

  // The form sends `teacherId`, so it has to be re-authorized here rather than
  // trusted: only an admin may assign a circle to somebody else, and only to an
  // active teacher inside this academy. The lookup also supplies the name the
  // circle is created under — see the note on `CircleValues.teacherId`.
  let ownerId = session.teacher.id;
  let ownerName = session.teacher.name;
  if (values.teacherId && values.teacherId !== session.teacher.id) {
    if (session.teacher.role !== "admin") {
      return { status: "failed", values, reason: "forbidden" };
    }

    const { data: owner } = await supabase
      .from("teachers")
      .select("id, name")
      .eq("id", values.teacherId)
      .eq("academy_id", academy.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!owner) {
      return {
        status: "invalid",
        values,
        fieldErrors: { teacherId: "teacherRequired" },
      };
    }
    ownerId = owner.id;
    ownerName = owner.name;
  }

  const { data: createdCircle, error } = await supabase
    .from("circles")
    .insert({
      teacher_id: ownerId,
      academy_id: academy.id,
      name: ownerName,
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

    // fk_circles_type: the slug was deactivated or removed between the page
    // loading and the form being submitted. Same field error as an empty
    // selection, since to the teacher it is the same fix — pick a type again.
    if (error?.code === "23503") {
      return { status: "invalid", values, fieldErrors: { type: "typeRequired" } };
    }

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
