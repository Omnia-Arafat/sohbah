import { isAdminRole } from "@/lib/auth/roles";
import type { Metadata } from "next";
import { BarChart, CalendarDays, CirclePlus, GraduationCap, Home, Tags, UserCheck, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronForward } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "../login/login-form";
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

  /*
    The admin entrance signs you in where you stand rather than bouncing you to
    the teachers' sign-in page and back. `/admin` is the address you give
    someone who administers the academy, so it has to work as a landing page for
    a signed-out visitor — not just as a guarded destination.

    This is presentation only. It is the same `signIn` action and the same
    Supabase session; every admin screen still checks the role for itself.
  */
  const session = await getTeacherSession();

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <section>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("signIn.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("signIn.subtitle")}</p>
        </section>

        {!isSupabaseConfigured() && <SetupNotice />}

        <LoginForm academySlug={academySlug} next={`/${academySlug}/admin`} />

        <p className="text-center text-sm text-muted-foreground">
          {t("signIn.teachersNote")}{" "}
          <Link
            href={`/${academySlug}/login`}
            className="font-medium text-brand-700 underline dark:text-brand-300"
          >
            {t("signIn.teachersLink")}
          </Link>
        </p>
      </div>
    );
  }

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // One tier for now: anyone approved may look. The controls that change
  // something are hidden below and re-checked in every server action.
  const isAdmin = isAdminRole(session.teacher);

  const supabase = await createClient();

  // Get statistics for this academy
  const [circlesResult, studentsResult, teachersResult, pendingResult] = await Promise.all([
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
    // Applications waiting for approval, surfaced on the card itself.
    supabase
      .from("teachers")
      .select("*", { count: "exact", head: true })
      .eq("academy_id", academy.id)
      .eq("is_active", false),
  ]);

  const circlesCount = circlesResult.count ?? 0;
  const studentsCount = studentsResult.count ?? 0;
  const teachersCount = teachersResult.count ?? 0;
  const pendingTeachersCount = pendingResult.count ?? 0;

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
              <Users className="h-6 w-6" aria-hidden="true" />
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

        {/*
          A مشرفة could already reach circle creation through /admin/circles's
          own "new circle" button, but that buries it a click deep inside a
          list page. This puts the same form — /dashboard/new already grants
          an admin the teacher-assignment picker — on the control panel itself.

          This card may end up admin-only later, if /admin itself is ever
          locked down that way — fine, since it is only a shortcut. The
          `/dashboard` copy of this same link is the one that must survive
          that change; see the comment there.
        */}
        {isAdmin && (
          <Link
            href={`/${academySlug}/dashboard/new`}
            className="card hover:border-brand-600 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
                <CirclePlus className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{t("newCircleCard.title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("newCircleCard.subtitle")}
                </p>
              </div>
              <ChevronForward />
            </div>
          </Link>
        )}

        {/* Managing the type taxonomy is مشرفة-only — unlike the other cards
            here, this one is not shown to a plain teacher at all. */}
        {isAdmin && (
          <Link
            href={`/${academySlug}/admin/circle-types`}
            className="card hover:border-brand-600 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
                <Tags className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{t("circleTypesCard.title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("circleTypesCard.subtitle")}
                </p>
              </div>
              <ChevronForward />
            </div>
          </Link>
        )}

        {isAdmin && (
          <Link
            href={`/${academySlug}/admin/schedules`}
            className="card hover:border-brand-600 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
                <CalendarDays className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{t("schedulesCard.title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("schedulesCard.subtitle")}
                </p>
              </div>
              <ChevronForward />
            </div>
          </Link>
        )}

        <Link
          href={`/${academySlug}/admin/students`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <GraduationCap className="h-6 w-6" aria-hidden="true" />
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
          href={`/${academySlug}/admin/teachers`}
          className="card hover:border-brand-600 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-brand-100 p-3 text-brand-700">
              <UserCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{t("teachersCard.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {pendingTeachersCount > 0
                  ? t("teachersCard.pending", {
                      count: String(pendingTeachersCount),
                    })
                  : t("teachersCard.subtitle")}
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
              <BarChart className="h-6 w-6" aria-hidden="true" />
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
              <Home className="h-6 w-6" aria-hidden="true" />
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
