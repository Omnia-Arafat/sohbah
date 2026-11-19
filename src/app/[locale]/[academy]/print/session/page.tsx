import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { PrintButton } from "@/app/[locale]/[academy]/admin/reports/print/print-button";
import { requireStaffSession } from "@/lib/auth/dal";
import { getAcademyContext } from "@/lib/academy-context";
import { fullStudentName } from "@/lib/student-name";
import { createClient } from "@/lib/supabase/server";

/**
 * تقرير الحلقة: one circle, one session date — who came, who recited, and for
 * a track circle, who of the cohort did not come and what the لقاء marks were.
 *
 * Opened from the circle page right after the session, so the attendance can
 * be saved as PDF without going through the reports filters.
 */

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ circle?: string; date?: string }>;
};

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sessionReport" });
  return { title: t("title") };
}

type Line = {
  key: string;
  name: string;
  joinedAt: string | null;
  status: "recited" | "notRecited" | "absent";
  cohortId: string | null;
  enrollmentId: string | null;
};

type CohortRow = {
  id: string;
  name_ar: string;
  start_date: string;
  tracks: { name_ar: string } | null;
  track_enrollments: { id: string; student_id: string; status: string; students: { name: string; father_name: string | null } | null }[];
};

export default async function SessionReportPage({ params, searchParams }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sessionReport");

  const { circle: circleId, date } = await searchParams;
  await requireStaffSession(`/${academySlug}/dashboard`);

  const academy = await getAcademyContext(academySlug);
  if (!academy || !circleId || !UUID.test(circleId) || !date || !ISO_DATE.test(date)) notFound();

  const supabase = await createClient();
  const { data: circle } = await supabase
    .from("circles")
    .select("id, name, academy_id, timezone")
    .eq("id", circleId)
    .eq("academy_id", academy.id)
    .maybeSingle();
  if (!circle) notFound();

  const [attendance, cohortsResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("student_id, joined_at, queue_order, recitation_status, students(name, father_name)")
      .eq("circle_id", circle.id)
      .eq("session_date", date)
      .order("queue_order"),
    supabase
      .from("track_cohorts" as never)
      .select(
        "id, name_ar, start_date, tracks(name_ar), " +
          "track_enrollments(id, student_id, status, students(name, father_name))",
      )
      .eq("circle_id" as never, circle.id as never)
      .lte("start_date" as never, date as never),
  ]);
  if (attendance.error) console.error("session report: attendance failed", attendance.error);
  if (cohortsResult.error) console.error("session report: cohorts failed", cohortsResult.error);

  const cohorts = (cohortsResult.data ?? []) as unknown as CohortRow[];
  const records = (attendance.data ?? []) as unknown as {
    student_id: string;
    joined_at: string | null;
    recitation_status: string;
    students: { name: string; father_name: string | null } | null;
  }[];

  // Which cohort place each student holds here, to show her لقاء marks and
  // to list the cohort's students who did not come.
  const placeOf = new Map<string, { cohortId: string; enrollmentId: string }>();
  for (const c of cohorts) {
    for (const e of c.track_enrollments ?? []) {
      if (e.status === "active" || e.status === "warned") {
        placeOf.set(e.student_id, { cohortId: c.id, enrollmentId: e.id });
      }
    }
  }

  const came = new Set(records.map((r) => r.student_id));
  const lines: Line[] = [
    ...records.map((r) => ({
      key: r.student_id,
      name: fullStudentName(r.students?.name ?? "", r.students?.father_name),
      joinedAt: r.joined_at,
      status: (r.recitation_status === "done" ? "recited" : "notRecited") as Line["status"],
      cohortId: placeOf.get(r.student_id)?.cohortId ?? null,
      enrollmentId: placeOf.get(r.student_id)?.enrollmentId ?? null,
    })),
    ...cohorts.flatMap((c) =>
      (c.track_enrollments ?? [])
        .filter((e) => (e.status === "active" || e.status === "warned") && !came.has(e.student_id))
        .map((e) => ({
          key: e.student_id,
          name: fullStudentName(e.students?.name ?? "", e.students?.father_name),
          joinedAt: null,
          status: "absent" as const,
          cohortId: c.id,
          enrollmentId: e.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar")),
    ),
  ];

  // The marks given at this meeting, stored under the meeting's own week.
  const weekOf = (c: CohortRow) =>
    Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / DAY_MS / 7) + 1;
  const enrollmentIds = [...placeOf.values()].map((p) => p.enrollmentId);
  const marks = new Map<string, number>();
  const excuses = new Map<string, string>();
  if (enrollmentIds.length > 0) {
    const read = (c: CohortRow, columns: string) =>
      supabase
        .from("track_meeting_scores" as never)
        .select(columns)
        .in("enrollment_id" as never, (c.track_enrollments ?? []).map((e) => e.id) as never)
        .eq("week_number" as never, weekOf(c) as never);
    const results = await Promise.all(
      cohorts.map(async (c) => {
        const withReason = await read(c, "enrollment_id, points_awarded, excused, excuse_reason");
        return withReason.error ? read(c, "enrollment_id, points_awarded, excused") : withReason;
      }),
    );
    for (const result of results) {
      if (result.error) console.error("session report: meeting scores failed", result.error);
      for (const row of (result.data ?? []) as unknown as {
        enrollment_id: string;
        points_awarded: number;
        excused: boolean;
        excuse_reason?: string | null;
      }[]) {
        if (row.excused) {
          const known = excuses.get(row.enrollment_id);
          excuses.set(row.enrollment_id, known || row.excuse_reason || "");
        }
        marks.set(row.enrollment_id, (marks.get(row.enrollment_id) ?? 0) + Number(row.points_awarded));
      }
    }
  }
  const anyMarks = marks.size > 0 || excuses.size > 0;

  const ar = locale === "ar";
  const num = new Intl.NumberFormat(ar ? "ar-EG" : "en");
  const longDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const time = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: circle.timezone,
  });
  const generatedOn = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const count = (s: Line["status"]) => lines.filter((l) => l.status === s).length;
  const cohortName = new Map(cohorts.map((c) => [c.id, `${c.tracks?.name_ar ?? ""} · ${c.name_ar}`]));
  const academyName = ar ? academy.name_ar : academy.name_en;
  const statusClass: Record<Line["status"], string> = {
    recited: "text-brand-700 dark:text-brand-300",
    notRecited: "text-accent-700 dark:text-accent-200",
    absent: "text-absent",
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/${academySlug}/dashboard/circle/${circle.id}`}>{t("back")}</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">{t("howToSave")}</span>
          <PrintButton label={t("download")} />
        </div>
      </div>

      <header
        className="-mx-4 flex flex-col gap-1 rounded-2xl px-5 py-4 print:mx-0"
        style={{ backgroundColor: `${academy.primary_color}14` }}
      >
        <p className="text-sm font-medium text-muted-foreground">
          {academyName} · {t("title")}
        </p>
        <h1 className="font-display text-2xl font-bold" style={{ color: academy.primary_color }}>
          {circle.name}
        </h1>
        <p className="text-sm">{longDate}</p>
        {cohorts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {cohorts.map((c) => cohortName.get(c.id)).join("، ")}
          </p>
        )}
      </header>

      <section className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1">
          {t("came", { count: records.length })}
        </span>
        <span className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1">
          {t("recitedCount", { count: count("recited") })}
        </span>
        {count("notRecited") > 0 && (
          <span className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1">
            {t("notRecitedCount", { count: count("notRecited") })}
          </span>
        )}
        {cohorts.length > 0 && (
          <span className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1">
            {t("absentCount", { count: count("absent") })}
          </span>
        )}
      </section>

      {lines.length === 0 ? (
        <p className="card text-muted-foreground">{t("empty")}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: `2px solid ${academy.primary_color}` }}>
              <th className="w-8 px-2 py-2 text-start font-bold">#</th>
              <th className="px-2 py-2 text-start font-bold">{t("student")}</th>
              <th className="px-2 py-2 text-start font-bold">{t("joined")}</th>
              <th className="px-2 py-2 text-start font-bold">{t("status")}</th>
              {anyMarks && <th className="px-2 py-2 text-start font-bold">{t("marks")}</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.key} className="border-b border-border-subtle break-inside-avoid">
                <td className="px-2 py-2 tabular-nums text-muted-foreground">{num.format(i + 1)}</td>
                <td className="px-2 py-2 font-semibold">{line.name}</td>
                <td className="px-2 py-2 tabular-nums">
                  {line.joinedAt ? time.format(new Date(line.joinedAt)) : "—"}
                </td>
                <td className={`px-2 py-2 font-bold ${statusClass[line.status]}`}>
                  {t(`statuses.${line.status}`)}
                </td>
                {anyMarks && (
                  <td className="px-2 py-2 tabular-nums">
                    {line.enrollmentId && excuses.has(line.enrollmentId)
                      ? excuses.get(line.enrollmentId)
                        ? t("excusedFor", { reason: excuses.get(line.enrollmentId)! })
                        : t("excused")
                      : line.enrollmentId && marks.has(line.enrollmentId)
                      ? num.format(marks.get(line.enrollmentId)!)
                      : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {anyMarks && <p className="text-xs text-muted-foreground">{t("marksNote")}</p>}
      <p className="text-xs text-muted-foreground">{t("generatedOn", { date: generatedOn })}</p>
    </div>
  );
}
