import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { EditCohortForm } from "./edit-form";

type PageProps = {
  params: Promise<{
    locale: string;
    academy: string;
    id: string;
    cohortId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cohortEdit" });
  return { title: t("title") };
}

/**
 * Today, as the academy reckons it — en-CA because it is ISO-ordered.
 *
 * The preview's week number has to match the one the database computes, and
 * the database counts whole days from `start_date`. Letting the admin's own
 * browser decide what "today" is would put the preview a day out whenever she
 * opens the screen late at night from another timezone.
 */
function todayInAcademyTime(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type CohortRow = {
  id: string;
  name_ar: string;
  start_date: string;
  max_students: number | null;
  teacher_id: string | null;
  status: string;
  tracks: { name_ar: string; duration_weeks: number } | null;
};

export default async function EditCohortPage({ params }: PageProps) {
  const { locale, academy: academySlug, id, cohortId } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("cohortEdit");
  const tTracks = await getTranslations("tracks");
  const tAdmin = await getTranslations("admin");
  const session = await getTeacherSession();

  if (!session || !isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session?.teacher ? "inactive" : "notLinked"}
        email={session?.email ?? null}
      />
    );
  }

  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tTracks("adminOnly")}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [cohortResult, teachersResult] = await Promise.all([
    supabase
      .from("track_cohorts" as never)
      .select(
        "id, name_ar, start_date, max_students, teacher_id, status, " +
          "tracks(name_ar, duration_weeks)",
      )
      .eq("id" as never, cohortId as never)
      .eq("academy_id" as never, academy.id as never)
      .maybeSingle(),
    supabase
      .from("teachers")
      .select("id, name")
      .eq("academy_id", academy.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (cohortResult.error || !cohortResult.data) notFound();
  const cohort = cohortResult.data as unknown as CohortRow;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <nav className="text-xs text-muted-foreground">
        <Link
          href={`/${academySlug}/admin/tracks/${id}/cohorts/${cohortId}`}
          className="hover:underline"
        >
          {cohort.name_ar}
        </Link>
      </nav>

      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("subtitle", { track: cohort.tracks?.name_ar ?? "" })}
        </p>
      </section>

      <EditCohortForm
        academySlug={academySlug}
        trackId={id}
        cohortId={cohort.id}
        durationWeeks={cohort.tracks?.duration_weeks ?? 40}
        today={todayInAcademyTime()}
        teachers={teachersResult.data ?? []}
        initial={{
          name: cohort.name_ar,
          startDate: cohort.start_date,
          maxStudents: cohort.max_students,
          teacherId: cohort.teacher_id,
          status: cohort.status,
        }}
      />
    </div>
  );
}
