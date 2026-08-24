import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronForward } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getAcademyAdminRole } from "@/lib/academy-display";
import { notFound } from "next/navigation";

type AdminPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: AdminPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations("admin");
  const adminRole = getAcademyAdminRole(academySlug, locale);

  const session = await requireTeacherSession(`/${academySlug}/admin`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // Only admins can access this page
  if (session.teacher.role !== "admin") {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold">{t("accessDenied")}</h2>
        <p className="mt-2 text-muted-foreground">{t("adminRequired")}</p>
      </div>
    );
  }

  const supabase = await createClient();

  // Get statistics for this academy
  const [circlesResult, studentsResult, teachersResult] = await Promise.all([
    supabase
      .from("circles")
      .select("*", { count: "exact" })
      .eq("academy_id", academy.id)
      .eq("is_active", true),
    supabase
      .from("students")
      .select("*", { count: "exact" })
      .eq("academy_id", academy.id),
    supabase
      .from("teachers")
      .select("*", { count: "exact" })
      .eq("academy_id", academy.id)
      .eq("is_active", true),
  ]);

  const circlesCount = circlesResult.count ?? 0;
  const studentsCount = studentsResult.count ?? 0;
  const teachersCount = teachersResult.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {adminRole ?? t("subtitle")}
        </p>
      </section>

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-muted-foreground">{t("stats.circles")}</p>
          <p className="mt-1 text-3xl font-bold">{circlesCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted-foreground">{t("stats.students")}</p>
          <p className="mt-1 text-3xl font-bold">{studentsCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted-foreground">{t("stats.teachers")}</p>
          <p className="mt-1 text-3xl font-bold">{teachersCount}</p>
        </div>
      </section>

      {/* Management Links */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`/${academySlug}/admin/circles`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{t("circles.manage")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("circles.manageSubtitle")}
              </p>
            </div>
            <ChevronForward />
          </div>
        </Link>

        <Link
          href={`/${academySlug}/admin/students`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{t("students.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("students.subtitle")}
              </p>
            </div>
            <ChevronForward />
          </div>
        </Link>

        <Link
          href={`/${academySlug}/admin/reports`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{t("reportsCard.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("reportsCard.subtitle")}
              </p>
            </div>
            <ChevronForward />
          </div>
        </Link>

        <Link
          href={`/${academySlug}/dashboard`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{t("dashboardCard.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("dashboardCard.subtitle")}
              </p>
            </div>
            <ChevronForward />
          </div>
        </Link>
      </section>
    </div>
  );
}
