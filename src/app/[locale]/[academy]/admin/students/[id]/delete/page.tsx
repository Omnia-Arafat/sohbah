import { canManageStudents } from "@/lib/auth/roles";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";
import { DeleteStudentForm } from "./delete-form";

type DeleteStudentPageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: DeleteStudentPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.students" });
  return { title: t("deleteTitle") };
}

export default async function DeleteStudentPage({ params }: DeleteStudentPageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.students");
  const tAdmin = await getTranslations("admin");
  const session = await requireTeacherSession(`/${academySlug}/admin/students`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // Supervisors manage the student roster, same as admins.
  if (!canManageStudents(session.teacher)) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold">{tAdmin("accessDenied")}</h2>
        <p className="mt-2 text-muted-foreground">{tAdmin("adminRequired")}</p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .single();

  if (error || !student) notFound();

  const { count: attendanceCount } = await supabase
    .from("attendance_records")
    .select("*", { count: "exact", head: true })
    .eq("student_id", id);

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex flex-col gap-6">
        <section>
          <h1 className="font-display text-2xl font-bold sm:text-3xl text-absent">
            {t("deleteTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("deleteSubtitle")}</p>
        </section>

        <BackLink href={`/${academySlug}/admin/students`}>{t("backToStudents")}</BackLink>

        <DeleteStudentForm
          studentId={id}
          studentName={student.name}
          academySlug={academySlug}
          attendanceCount={attendanceCount ?? 0}
        />
      </div>
    </div>
  );
}
