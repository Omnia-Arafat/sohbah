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
import { canEditAnyCircle, isAdminRole } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";

type CirclesAdminPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ type?: string }>;
};

type CohortRoster = {
  id: string;
  name_ar: string;
  teacher_id: string | null;
  tracks: { name_ar: string } | null;
  track_enrollments: { status: string; students: { name: string } | null }[] | null;
};

// The same set the cohort pages count as "on the track".
const ON_TRACK = ["active", "warned"];

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: Pick<CirclesAdminPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.circles" });
  const tAdmin = await getTranslations({ locale, namespace: "admin" });
  return { title: `${t("manage")} · ${tAdmin("title")}` };
}

export default async function CirclesAdminPage({
  params,
  searchParams,
}: CirclesAdminPageProps) {
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

  // A supervisor or an admin edits any circle in the academy; everyone else
  // edits the ones that are hers. Decided per circle, just below.
  const editsAnyCircle = canEditAnyCircle(session.teacher);
  const teacherId = session.teacher.id;

  // Deleting stays with admins: it is the one action here that cannot be
  // undone, and it takes the circle's attendance history with it.
  const canDelete = isAdminRole(session.teacher);

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

  // Only offer the types some circle actually has, so no chip leads to an
  // empty list.
  const usedTypes = circleTypes.filter((type) =>
    circles.some((circle) => circle.type === type.slug),
  );
  const { type: typeParam } = await searchParams;
  const selectedType = usedTypes.some((type) => type.slug === typeParam)
    ? typeParam
    : null;
  const shownCircles = selectedType
    ? circles.filter((circle) => circle.type === selectedType)
    : circles;

  // A track circle is its teacher's weekly meeting: track_cohorts.circle_id is
  // never filled in, so the cohorts it serves are the ones she teaches. One
  // teacher can hold two cohorts on the same circle.
  const { data: cohortsRaw, error: cohortsError } = await supabase
    .from("track_cohorts" as never)
    .select(
      "id, name_ar, teacher_id, tracks(name_ar), track_enrollments(status, students(name))",
    )
    .eq("academy_id" as never, academy.id as never)
    .in("status" as never, ["registering", "running"] as never);
  if (cohortsError) console.error("Failed to fetch cohorts:", cohortsError);
  const cohorts = (cohortsRaw ?? []) as unknown as CohortRoster[];

  const cohortsByTeacher = new Map<string, CohortRoster[]>();
  for (const cohort of cohorts) {
    if (!cohort.teacher_id) continue;
    const list = cohortsByTeacher.get(cohort.teacher_id) ?? [];
    list.push(cohort);
    cohortsByTeacher.set(cohort.teacher_id, list);
  }

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

      {usedTypes.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={tCircles("filterByType")}>
          {[{ slug: null, label: tCircles("allTypes") }, ...usedTypes.map((type) => ({
            slug: type.slug,
            label: circleTypeLabel(circleTypes, type.slug, locale),
          }))].map(({ slug, label }) => {
            const active = slug === selectedType;
            return (
              <Link
                key={slug ?? "all"}
                href={slug ? `/${academySlug}/admin/circles?type=${slug}` : `/${academySlug}/admin/circles`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-border text-muted-foreground hover:bg-surface-muted"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}

      {circles.length > 0 && (
        <ListSearch
          scopeId="circles-list"
          placeholder={tCircles("searchPlaceholder")}
          emptyText={tCircles("searchEmpty")}
        />
      )}

      {circles.length === 0 ? (
        <div className="card text-center">
          <p className="text-muted-foreground">{tCircles("noCircles")}</p>
          <Link href={`/${academySlug}/dashboard/new`} className="btn-primary mt-4">
            {tCircles("createFirst")}
          </Link>
        </div>
      ) : (
        <div id="circles-list" className="scroll-list grid gap-4">
          {shownCircles.map((circle) => {
            const circleCohorts =
              circle.type === "tracks" ? cohortsByTeacher.get(circle.teacher_id) ?? [] : [];
            return (
            <div
              key={circle.id}
              className="card"
              // What the search field matches this row against.
              data-search={`${circle.teacher?.name ?? ""} ${circle.name}`}
            >
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

                {circleCohorts.map((cohort) => {
                  const names = (cohort.track_enrollments ?? [])
                    .filter((e) => ON_TRACK.includes(e.status))
                    .map((e) => e.students?.name ?? tCircles("unknown"))
                    .sort((a, b) => a.localeCompare(b, "ar"));
                  return (
                    <details key={cohort.id} className="rounded-lg border border-border px-3 py-2">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {cohort.tracks?.name_ar} · {cohort.name_ar}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({tCircles("studentCount", { count: names.length })})
                        </span>
                      </summary>
                      {names.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {tCircles("noCohortStudents")}
                        </p>
                      ) : (
                        <ol className="mt-2 list-decimal ps-5 text-sm">
                          {names.map((name, i) => (
                            <li key={`${name}-${i}`}>{name}</li>
                          ))}
                        </ol>
                      )}
                    </details>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2">
                  {(editsAnyCircle || circle.teacher_id === teacherId) && (<Link
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
            );
          })}
        </div>
      )}
    </div>
  );
}
