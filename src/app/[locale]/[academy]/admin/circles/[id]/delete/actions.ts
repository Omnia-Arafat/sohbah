"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getLocale, getTranslations } from "next-intl/server";

type DeleteState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function deleteCircle(
  _prevState: DeleteState,
  formData: FormData
): Promise<DeleteState> {
  const t = await getTranslations("admin.circles.errors");
  const circleId = formData.get("circleId") as string;
  const academySlug = formData.get("academySlug") as string;

  const session = await getTeacherSession();
  if (!isActiveTeacher(session) || session.teacher.role !== "admin") {
    return { status: "error", message: t("unauthorized") };
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    return { status: "error", message: t("notFound") };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("circles")
    .delete()
    .eq("id", circleId)
    .eq("academy_id", academy.id);

  if (error) {
    console.error("Failed to delete circle:", error);
    return { status: "error", message: t("failed") };
  }

  revalidatePath(`/${academySlug}/admin/circles`);

  const locale = await getLocale();
  redirect(`/${locale}/${academySlug}/admin/circles`);
}
