"use server";

import type { GenderCategory } from "@/lib/database.types";
import { toE164, validatePhone } from "@/lib/phone";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { RegisterState, RegisterValues } from "./state";

const MAX_LENGTH = 80;

/** Unique violation — the only one on `students` is the per-academy phone key. */
const UNIQUE_VIOLATION = "23505";

function readValues(formData: FormData): RegisterValues {
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: read("name"),
    phone: read("phone"),
    phoneCountry: read("phoneCountry"),
    gender: read("gender"),
  };
}

export async function registerStudent(
  _previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const values = readValues(formData);
  const circleSlug = String(formData.get("circleSlug") ?? "").trim() || null;
  const academyId = String(formData.get("academyId") ?? "").trim();
  // Set by the "register anyway" button after a duplicate warning.
  const confirmedDuplicate = formData.get("confirmDuplicate") === "1";

  const fieldErrors: Partial<Record<keyof RegisterValues, string>> = {};
  if (!values.name) fieldErrors.name = "nameRequired";
  else if (values.name.length > MAX_LENGTH) fieldErrors.name = "tooLong";
  if (values.gender !== "male" && values.gender !== "female") {
    fieldErrors.gender = "genderRequired";
  }
  // Required, but deliberately not unique: siblings share one parent's number.
  // `students_phone_required` enforces the same rule in the database.
  //
  // The country picker is what makes the check meaningful: each country has its
  // own length and mobile prefix, so "0104018960" (an Egyptian number a digit
  // short) is rejected here instead of being stored and found months later.
  if (values.phone.length > 32) fieldErrors.phone = "tooLong";
  else {
    const phoneError = validatePhone(values.phoneCountry, values.phone);
    if (phoneError) fieldErrors.phone = phoneError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", values, fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    return { status: "failed", values, reason: "notConfigured" };
  }

  if (!academyId) {
    return { status: "failed", values, reason: "generic" };
  }

  const gender = values.gender as GenderCategory;
  const supabase = await createClient();
  // Kept for compatibility with the existing database schema. New students
  // only need to enter their name once in the simplified form.
  const fatherName = "-";

  // Risk 2 in the brief: warn on an identical name + father's name rather than
  // blocking it, since real people do share both.
  if (!confirmedDuplicate) {
    const { data: matches, error } = await supabase.rpc("find_similar_students", {
      p_name: values.name,
      p_father_name: fatherName,
      p_gender: gender,
      p_academy_id: academyId,
    });

    if (error) {
      console.error("find_similar_students failed", error);
      return { status: "failed", values, reason: "generic" };
    }

    if (matches && matches.length > 0) {
      return { status: "duplicate", values, matches };
    }
  }

  // Stored in E.164 so one line is one `phone_key`, however it was typed.
  const phone = toE164(values.phoneCountry, values.phone);
  if (!phone) {
    return { status: "invalid", values, fieldErrors: { phone: "phoneInvalid" } };
  }

  const { error } = await supabase.from("students").insert({
    name: values.name,
    father_name: fatherName,
    phone,
    gender_category: gender,
    academy_id: academyId,
  });

  if (error) {
    // Safety net only. Students have no unique phone rule (see migration
    // 20260830140000), so this should not fire — but if the rule is ever
    // tightened, the form already reports the right thing.
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "invalid", values, fieldErrors: { phone: "phoneTaken" } };
    }
    console.error("student insert failed", error);
    return { status: "failed", values, reason: "generic" };
  }

  return { status: "success", name: values.name, circleSlug };
}
