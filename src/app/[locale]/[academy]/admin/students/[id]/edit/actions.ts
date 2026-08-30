"use server";

import { revalidatePath } from "next/cache";
import { isActiveTeacher, getTeacherSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import type { GenderCategory } from "@/lib/database.types";

type StudentFormValues = {
  name: string;
  father_name: string;
  phone: string | null;
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
  const father_name = formData.get("father_name")?.toString().trim() || "";
  const phone = formData.get("phone")?.toString().trim() || null;
  const gender = formData.get("gender")?.toString() || "";

  // Validate
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "Name is required";
  else if (name.length > 120) fieldErrors.name = "Name is too long";

  if (!father_name) fieldErrors.father_name = "Father's name is required";
  else if (father_name.length > 120) fieldErrors.father_name = "Name is too long";

  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "Gender is required";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "invalid",
      values: { name, father_name, phone, gender_category: gender },
      fieldErrors,
    };
  }

  // Update in database
  const supabase = await createClient();

  const { data: updatedStudent, error } = await supabase
    .from("students")
    .update({
      name,
      father_name,
      phone: phone || null,
      gender_category: gender as GenderCategory,
    })
    .eq("id", studentId)
    .eq("academy_id", academy.id)
    .select("id")
    .maybeSingle();

  if (error || !updatedStudent) {
    console.error("Failed to update student:", error);
    return { status: "error", message: "Failed to save changes" };
  }

  revalidatePath(`/${locale}/${academySlug}/admin/students`);
  revalidatePath(`/${locale}/${academySlug}/admin/students/${studentId}/edit`);

  return { status: "success", message: "Changes saved successfully" };
}
