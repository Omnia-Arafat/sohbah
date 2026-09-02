import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { formatTime } from "@/lib/format-time";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";
import { CopyLinkButton } from "@/components/copy-link-button";

type CirclesAdminPageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: CirclesAdminPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.circles" });
  const tAdmin = await getTranslations({ locale, namespace: "admin" });
  return { title: `${t("manage")} · ${tAdmin("title")}` };
}

export default async function CirclesAdminPage({ params }: CirclesAdminPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const t = await getTranslations();
  const tCircles = await getTranslations("admin.circles");
  const tAdmin = await getTranslations("admin");

  const session = await requireTeacherSession(`/${academySlug}/admin/circles`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // Only admins can access this page
  // One tier for now: anyone approved may look. The controls that change
  // something are hidden below and re-checked in every server action.
  const canManage = session.teacher.role === "admin";

  const supabase = await createClient();

  // Get all circles for this academy with teacher info
  const { data: circlesRaw, error } = await supabase
    .from("circles")
    .select("*")
    .eq("academy_id", academy.id)
    .order("created_at", { ascending: false });

  // Get teacher names
  const circles = circlesRaw ? await Promise.all(
    circlesRaw.map(async (circle) => {
      const { data: teacher } = await supabase
        .from("teachers")
        .select("name")
        .eq("id", circle.teacher_id)
        .single();
      return { ...circle, teacher };
    })
  ) : [];

  if (error) console.error("Failed to fetch circles:", error);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {tCircles("manage")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {tCircles("manageSubtitle")}
          </p>
        </div>
        <Link href={`/${academySlug}/dashboard/new`} className="btn-primary w-full sm:w-auto">
          {tCircles("new")}
        </Link>
      </section>

      <BackLink href={`/${academySlug}/admin`}>{tAdmin("backToAdmin")}</BackLink>

      {!circles || circles.length === 0 ? (
        <div className="card text-center">
          <p className="text-muted-foreground">{tCircles("noCircles")}</p>
          <Link href={`/${academySlug}/dashboard/new`} className="btn-primary mt-4">
            {tCircles("createFirst")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {circles.map((circle) => (
            <div key={circle.id} className="card">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold">{circle.name}</h3>
                      {!circle.is_active && (
                        <span className="badge-waiting text-xs">{tCircles("inactive")}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`circle.type.${circle.type}`)} · {t(`dashboard.gender.${circle.gender_category}`)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tCircles("teacherLabel", { name: circle.teacher?.name || tCircles("unknown") })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("circle.startsAt", { time: formatTime(circle.start_time, locale) })} ·{" "}
                      {circle.days_of_week
                        .slice()
                        .sort((a, b) => a - b)
                        .map((day) => t(`dashboard.daysShort.${day}`))
                        .join(", ")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canManage && (<Link
                    href={`/${academySlug}/admin/circles/${circle.id}/edit`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm"
                    title={tCircles("edit")}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {tCircles("edit")}
                  </Link>)}
                  <Link
                    href={`/${academySlug}/dashboard/circle/${circle.id}`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm"
                    title={tCircles("session")}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {tCircles("session")}
                  </Link>
                  <CopyLinkButton path={`/${locale}/${academySlug}/circle/${circle.registration_slug}`} />
                  {canManage && (<Link
                    href={`/${academySlug}/admin/circles/${circle.id}/delete`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm text-absent hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-950"
                    title={tCircles("delete")}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {tCircles("delete")}
                  </Link>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
