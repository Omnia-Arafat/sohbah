import type { Metadata } from "next";
import { Pencil, Trash2, Video } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { formatTime } from "@/lib/format-time";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
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

  // One tier for now: anyone approved may look, and — by the academy's own
  // decision — anyone approved may edit any circle, not only their own. The
  // supervisors who need this are stored as ordinary teachers, so there is no
  // narrower group to grant it to until a real supervisor role exists.
  const canEdit = true;

  // Deleting stays with admins: it is the one action here that cannot be
  // undone, and it takes the circle's attendance history with it.
  const canDelete = session.teacher.role === "admin";

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

  // `activeOnly: false` — an older circle can reference a since-deactivated
  // type, and the list still needs a real label for it, not a blank one.
  const circleTypes = await loadCircleTypes(supabase, academy.id, {
    activeOnly: false,
  });

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
        <div className="scroll-list grid gap-4">
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
                      {circleTypeLabel(circleTypes, circle.type, locale)} ·{" "}
                      {t(`dashboard.gender.${circle.gender_category}`)}
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
                  {canEdit && (<Link
                    href={`/${academySlug}/admin/circles/${circle.id}/edit`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm"
                    title={tCircles("edit")}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    {tCircles("edit")}
                  </Link>)}
                  <Link
                    href={`/${academySlug}/dashboard/circle/${circle.id}`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm"
                    title={tCircles("session")}
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    {tCircles("session")}
                  </Link>
                  <CopyLinkButton path={`/${locale}/${academySlug}/circle/${circle.registration_slug}`} />
                  {canDelete && (<Link
                    href={`/${academySlug}/admin/circles/${circle.id}/delete`}
                    className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm
                               text-absent hover:border-absent hover:bg-absent hover:text-white"
                    title={tCircles("delete")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
