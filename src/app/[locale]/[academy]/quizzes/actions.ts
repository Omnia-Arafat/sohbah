"use server";

import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import type { Me } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/server";

/**
 * «اختبري نفسك كطالبة» for a معلمة, مشرفة or admin — including the one who
 * wrote the quiz.
 *
 * A quiz attempt belongs to a student row, and the phone on it is the
 * credential. staff_student_record() is her own student row — found, linked
 * or made the first time, exactly as when she takes a turn in a حلقة — and
 * its phone is her staff phone (or the same line, last nine digits), so the
 * staff phone is what she "types". Nothing here bypasses the phone check in
 * academy_quizzes or start_quiz_attempt.
 */
export async function staffAsStudent(): Promise<
  { ok: true; me: Me } | { ok: false; reason: "notStaff" | "staffPhoneMissing" | "generic" }
> {
  const session = await getTeacherSession();
  if (!isActiveTeacher(session)) return { ok: false, reason: "notStaff" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_student_record");
  if (error || !data?.[0]) {
    if (error?.message.includes("staff_phone_missing")) return { ok: false, reason: "staffPhoneMissing" };
    console.error("staff_student_record failed", error);
    return { ok: false, reason: "generic" };
  }

  const row = data[0];
  return {
    ok: true,
    me: {
      studentId: row.id,
      name: row.name,
      fatherName: row.father_name,
      phone: session.teacher.phone ?? "",
      genderCategory: row.gender_category as Me["genderCategory"],
    },
  };
}
