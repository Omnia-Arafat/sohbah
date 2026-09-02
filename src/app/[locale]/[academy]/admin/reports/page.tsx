import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { requireStaffSession } from "@/lib/auth/dal";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { getAcademyContext } from "@/lib/academy-context";
import type {
  AttendanceReportRow,
  Circle,
  CircleType,
  GenderCategory,
  Teacher,
} from "@/lib/database.types";
import { RANGE_PRESETS, resolveRange } from "@/lib/report-range";
import { createClient } from "@/lib/supabase/server";

type ReportsPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    gender?: string;
    circle?: string;
    type?: string;
    teacher?: string;
  }>;
};

const CIRCLE_TYPES: CircleType[] = ["tasheeh", "tajweed", "free_recitation"];

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: Pick<ReportsPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reports" });
  return { title: t("title") };
}

export default async function ReportsPage({
  params,
  searchParams,
}: ReportsPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("reports");
  const tDashboard = await getTranslations("dashboard");
  const tCircle = await getTranslations("circle");

  await requireStaffSession(`/${academySlug}/admin/reports`);

  const academy = await getAcademyContext(academySlug);

  const query = await searchParams;
  const range = resolveRange(query);

  // Everything below comes from a user-editable URL, so validate rather than
  // forwarding it into the RPC.
  const gender: GenderCategory | null =
    query.gender === "male" || query.gender === "female" ? query.gender : null;
  const circleId = query.circle && UUID.test(query.circle) ? query.circle : null;
  const teacherId = query.teacher && UUID.test(query.teacher) ? query.teacher : null;
  const circleType = CIRCLE_TYPES.includes(query.type as CircleType)
    ? (query.type as CircleType)
    : null;

  const supabase = await createClient();
  const [reportResult, circlesResult, teachersResult] = await Promise.all([
    supabase.rpc("attendance_report", {
      p_from: range.from,
      p_to: range.to,
      p_gender: gender,
      p_circle_id: circleId,
      p_teacher_id: teacherId,
      p_academy_id: academy?.id ?? null,
      p_circle_type: circleType,
    }),
    supabase.from("circles").select("*").order("type").order("name"),
    supabase.from("teachers").select("*").eq("is_active", true).order("name"),
  ]);

  if (reportResult.error) console.error("attendance_report failed", reportResult.error);

  const rows: AttendanceReportRow[] = reportResult.data ?? [];
  const circles: Circle[] = circlesResult.data ?? [];
  const teachers: Teacher[] = teachersResult.data ?? [];

  /** Circles carry only `teacher_id`; the label needs the name. */
  function teacherName(teacherId: string) {
    const teacher = teachers.find((candidate) => candidate.id === teacherId);
    return teacher
      ? getTeacherDisplayLabel(teacher, academySlug, locale)
      : t("filters.unknownTeacher");
  }

  const totals = rows.reduce(
    (acc, row) => ({
      joined: acc.joined + Number(row.sessions_joined),
      recited: acc.recited + Number(row.sessions_recited),
      notRecited: acc.notRecited + Number(row.sessions_not_recited),
    }),
    { joined: 0, recited: 0, notRecited: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/*
        A plain GET form: the whole report state lives in the URL, so a range can
        be bookmarked or shared and needs no client-side JavaScript.
      */}
      <form className="range-form card flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="range">
              {t("filters.range")}
            </label>
            <select
              id="range"
              name="range"
              className="input"
              defaultValue={range.preset}
            >
              {RANGE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`ranges.${preset}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="gender">
              {t("filters.gender")}
            </label>
            <select
              id="gender"
              name="gender"
              className="input"
              defaultValue={gender ?? ""}
            >
              <option value="">{t("filters.all")}</option>
              <option value="male">{tDashboard("gender.male")}</option>
              <option value="female">{tDashboard("gender.female")}</option>
            </select>
          </div>

          {/* Shown only when the range preset is "custom" — see `.range-form`
              in globals.css. */}
          <div className="range-custom-only">
            <label className="field-label" htmlFor="from">
              {t("filters.from")}
            </label>
            <input
              id="from"
              name="from"
              type="date"
              dir="ltr"
              className="input text-start"
              defaultValue={range.from}
            />
          </div>

          <div className="range-custom-only">
            <label className="field-label" htmlFor="to">
              {t("filters.to")}
            </label>
            <input
              id="to"
              name="to"
              type="date"
              dir="ltr"
              className="input text-start"
              defaultValue={range.to}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="type">
              {t("filters.type")}
            </label>
            <select
              id="type"
              name="type"
              className="input"
              defaultValue={circleType ?? ""}
            >
              <option value="">{t("filters.all")}</option>
              {CIRCLE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {tCircle(`type.${option}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="circle">
              {t("filters.circle")}
            </label>
            <select
              id="circle"
              name="circle"
              className="input"
              defaultValue={circleId ?? ""}
            >
              <option value="">{t("filters.all")}</option>
              {/*
                Circles are grouped under their type and labelled with the
                teacher, because a circle's `name` is free text — in practice
                it is often just the teacher's name, which made the bare list
                impossible to tell apart from the teacher filter below.
              */}
              {CIRCLE_TYPES.map((option) => {
                const inType = circles.filter((circle) => circle.type === option);
                if (inType.length === 0) return null;
                return (
                  <optgroup key={option} label={tCircle(`type.${option}`)}>
                    {inType.map((circle) => (
                      <option key={circle.id} value={circle.id}>
                        {t("filters.circleOption", {
                          name: circle.name,
                          teacher: teacherName(circle.teacher_id),
                        })}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="teacher">
              {t("filters.teacher")}
            </label>
            <select
              id="teacher"
              name="teacher"
              className="input"
              defaultValue={teacherId ?? ""}
            >
              <option value="">{t("filters.all")}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {getTeacherDisplayLabel(teacher, academySlug, locale)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full sm:w-auto">
          {t("filters.apply")}
        </button>
      </form>

      <section className="card">
        <p className="text-sm text-muted-foreground">
          {t("appliedRange", { from: range.from, to: range.to })}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="font-semibold">{totals.joined}</span>{" "}
            <span className="text-muted-foreground">{t("columns.joined")}</span>
          </span>
          <span>
            <span className="font-semibold text-present">{totals.recited}</span>{" "}
            <span className="text-muted-foreground">{t("columns.recited")}</span>
          </span>
          <span>
            <span className="font-semibold text-accent-700 dark:text-accent-300">
              {totals.notRecited}
            </span>{" "}
            <span className="text-muted-foreground">{t("columns.notRecited")}</span>
          </span>
        </div>

        {/*
          Joining the queue is the attendance mark, so every joined session
          counts. What the report has to keep visible is the gap: the student
          was there and took a place in the order, but never got to recite.
        */}
        {totals.notRecited > 0 && (
          <p className="mt-3 text-sm text-accent-700 dark:text-accent-300">
            {t("notRecitedWarning", { count: String(totals.notRecited) })}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("results.title", { count: String(rows.length) })}
        </h2>

        {rows.length === 0 ? (
          <p className="card text-muted-foreground">{t("results.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li
                key={row.student_id}
                className="card flex items-center gap-3 py-3"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center
                             rounded-full bg-surface-muted text-xs font-bold"
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.student_name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {tCircle("search.fatherLabel", { name: row.father_name })} ·{" "}
                    {tDashboard(`gender.${row.gender_category}`)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-3 text-sm tabular-nums">
                  <span
                    className="text-muted-foreground"
                    title={t("columns.joined")}
                  >
                    {row.sessions_joined}
                  </span>
                  <span className="text-present" title={t("columns.recited")}>
                    {row.sessions_recited}
                  </span>
                  <span
                    className={
                      Number(row.sessions_not_recited) > 0
                        ? "font-semibold text-accent-700 dark:text-accent-300"
                        : "text-muted-foreground"
                    }
                    title={t("columns.notRecited")}
                  >
                    {row.sessions_not_recited}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {t("results.legend")}
        </p>
      </section>
    </div>
  );
}
