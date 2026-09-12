"use server";

import { revalidatePath } from "next/cache";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import type { GenderCategory } from "@/lib/database.types";
import { toE164, validatePhone } from "@/lib/phone";

type StudentFormValues = {
  name: string;
  father_name: string;
  phone: string | null;
  /** ISO code the picker was left on, so an invalid save re-renders as typed. */
  phone_country: string;
  gender_category: string;
};

export type UpdateStudentState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | { status: "invalid"; values: StudentFormValues; fieldErrors: Record<string, string> };

export async function updateStudent(
  _previous: UpdateStudentState,
  formData: FormData,
): Promise<UpdateStudentState> {
  const studentId = formData.get("studentId")?.toString();
  const academySlug = formData.get("academySlug")?.toString();
  const locale = formData.get("locale")?.toString();

  if (!studentId || !academySlug || !locale) {
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
  const father_name = formData.get("father_name")?.toString().trim() || "";
  const phone = formData.get("phone")?.toString().trim() || "";
  const phone_country = formData.get("phoneCountry")?.toString().trim() || "";
  const gender = formData.get("gender")?.toString() || "";

  // Validate
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "nameRequired";
  else if (name.length > 120) fieldErrors.name = "tooLong";

  if (!father_name) fieldErrors.father_name = "fatherRequired";
  else if (father_name.length > 120) fieldErrors.father_name = "tooLong";

  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "genderRequired";
  }

  // Validated against the picked country, then stored as E.164 — see
  // `@/lib/phone`. The DB still rejects an empty number through
  // `students_phone_required`, so catch that here with a usable message.
  if (phone.length > 32) fieldErrors.phone = "tooLong";
  else {
    const phoneError = validatePhone(phone_country, phone);
    if (phoneError) fieldErrors.phone = phoneError;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "invalid",
      values: { name, father_name, phone, phone_country, gender_category: gender },
      fieldErrors,
    };
  }

  const storedPhone = toE164(phone_country, phone);
  if (!storedPhone) {
    return {
      status: "invalid",
      values: { name, father_name, phone, phone_country, gender_category: gender },
      fieldErrors: { phone: "phoneInvalid" },
    };
  }

  // Update in database
  const supabase = await createClient();

  const { data: updatedStudent, error } = await supabase
    .from("students")
    .update({
      name,
      father_name,
      phone: storedPhone,
      gender_category: gender as GenderCategory,
    })
    .eq("id", studentId)
    .eq("academy_id", academy.id)
    .select("id")
    .maybeSingle();

  if (error || !updatedStudent) {
    // Safety net: students have no unique phone rule, so this should not fire.
    if (error?.code === "23505") {
      return {
        status: "invalid",
        values: { name, father_name, phone, phone_country, gender_category: gender },
        fieldErrors: { phone: "phoneTaken" },
      };
    }
    console.error("Failed to update student:", error);
    return { status: "error", message: "saveFailed" };
  }

  revalidatePath(`/${locale}/${academySlug}/admin/students`);
  revalidatePath(`/${locale}/${academySlug}/admin/students/${studentId}/edit`);

  return { status: "success", message: "saved" };
}
