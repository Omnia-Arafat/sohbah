import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { MultiSelectDropdown } from "@/components/multi-select";
import { Link } from "@/i18n/navigation";
import { requireStaffSession } from "@/lib/auth/dal";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { getAcademyContext } from "@/lib/academy-context";
import type {
  AttendanceReportRow,
  Circle,
  GenderCategory,
  Teacher,
} from "@/lib/database.types";
import { loadCircleTypes } from "@/lib/circle-types";
import { REPORT_MODES, resolveRange } from "@/lib/report-range";
import { createClient } from "@/lib/supabase/server";

type ReportsPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{
    mode?: string;
    month?: string;
    week?: string;
    year?: string;
    from?: string;
    to?: string;
    gender?: string;
    type?: string;
    teacher?: string | string[];
  }>;
};


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
  const teacherIds = (Array.isArray(query.teacher) ? query.teacher : query.teacher ? [query.teacher] : [])
    .filter((id) => UUID.test(id));

  const supabase = await createClient();
  const [circleTypesResult, circlesResult, teachersResult] = await Promise.all([
    // `activeOnly: false` — a report can span a period before a type was
    // deactivated, and its rows must still filter and label correctly.
    academy ? loadCircleTypes(supabase, academy.id, { activeOnly: false }) : [],
    supabase.from("circles").select("*").order("type").order("name"),
    supabase.from("teachers").select("*").eq("is_active", true).order("name"),
  ]);

  const circleTypes = circleTypesResult;
  const circleType = circleTypes.some((type) => type.slug === query.type)
    ? (query.type as string)
    : null;

  const { data: reportRows, error: reportError } = await supabase.rpc(
    "attendance_report",
    {
      p_from: range.from,
      p_to: range.to,
      p_gender: gender,
      p_teacher_ids: teacherIds.length > 0 ? teacherIds : null,
      p_academy_id: academy?.id ?? null,
      p_circle_type: circleType,
    },
  );

  if (reportError) console.error("attendance_report failed", reportError);

  const rows: AttendanceReportRow[] = reportRows ?? [];
  const circles: Circle[] = circlesResult.data ?? [];
  const teachers: Teacher[] = teachersResult.data ?? [];

  // One filter, not two: a circle's own label already names its teacher, so
  // offering both a circle picker and a teacher picker just duplicated each
  // other. The teacher list narrows to whoever actually teaches the selected
  // circle type, so picking "تسميع حر" only offers its teachers to filter by.
  const teachersForType = circleType
    ? teachers.filter((teacher) =>
        circles.some((circle) => circle.teacher_id === teacher.id && circle.type === circleType),
      )
    : teachers;

  const totals = rows.reduce(
    (acc, row) => ({
      joined: acc.joined + Number(row.sessions_joined),
      recited: acc.recited + Number(row.sessions_recited),
      notRecited: acc.notRecited + Number(row.sessions_not_recited),
    }),
    { joined: 0, recited: 0, notRecited: 0 },
  );

  // The print page resolves its own range from these same picker values
  // rather than trusting from/to directly — mode "week"/"month"/"year" only
  // recompute from/to out of month/week/year, so those have to come along
  // too or the PDF would silently fall back to the current period.
  const printParams = new URLSearchParams({ mode: range.mode });
  if (range.mode === "week") {
    printParams.set("weekMonth", range.month);
    printParams.set("week", String(range.week));
  } else if (range.mode === "month") {
    printParams.set("month", range.month);
  } else if (range.mode === "year") {
    printParams.set("year", range.year);
  } else if (range.mode === "custom") {
    printParams.set("from", range.from);
    printParams.set("to", range.to);
  }
  if (gender) printParams.set("gender", gender);
  if (circleType) printParams.set("type", circleType);
  teacherIds.forEach((id) => printParams.append("teacher", id));
  const printHref = `/${academySlug}/admin/reports/print?${printParams.toString()}`;

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
        <div>
          <label className="field-label" htmlFor="mode">
            {t("filters.mode")}
          </label>
          <select id="mode" name="mode" className="input" defaultValue={range.mode}>
            {REPORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`filters.modes.${mode}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Exactly one of these four shows at a time, driven purely by which
            option in #mode is selected — see `.range-form` in globals.css. */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* A separate field name from the month-mode picker below, even
              though both mean "month" — two inputs sharing one `name` would
              both submit, since CSS `display: none` hides an input without
              removing it from the form. */}
          <div className="mode-week-only">
            <label className="field-label" htmlFor="weekMonth">
              {t("filters.month")}
            </label>
            <input
              id="weekMonth"
              name="weekMonth"
              type="month"
              dir="ltr"
              className="input text-start"
              defaultValue={range.month}
            />
          </div>

          <div className="mode-week-only">
            <label className="field-label" htmlFor="week">
              {t("filters.week")}
            </label>
            <select id="week" name="week" className="input" defaultValue={range.week}>
              {[1, 2, 3, 4].map((week) => (
                <option key={week} value={week}>
                  {t(`filters.weekOptions.${week}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mode-month-only">
            <label className="field-label" htmlFor="month">
              {t("filters.month")}
            </label>
            <input
              id="month"
              name="month"
              type="month"
              dir="ltr"
              className="input text-start"
              defaultValue={range.month}
            />
          </div>

          <div className="mode-year-only">
            <label className="field-label" htmlFor="year">
              {t("filters.year")}
            </label>
            <input
              id="year"
              name="year"
              type="number"
              inputMode="numeric"
              min="2020"
              max="2100"
              dir="ltr"
              className="input text-start"
              defaultValue={range.year}
            />
          </div>

          <div className="mode-custom-only">
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

          <div className="mode-custom-only">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
              {circleTypes.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {locale === "ar" ? option.name_ar : option.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="teacher">
              {t("filters.teacher")}
            </label>
            <MultiSelectDropdown
              id="teacher"
              name="teacher"
              options={teachersForType.map((teacher) => ({
                value: teacher.id,
                label: getTeacherDisplayLabel(teacher, academySlug, locale),
              }))}
              defaultValues={teacherIds}
              allLabel={t("filters.all")}
              doneLabel={t("filters.done")}
            />
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("filters.teacherHint")}
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full sm:w-auto">
          {t("filters.apply")}
        </button>
      </form>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("appliedRange", { from: range.from, to: range.to })}
          </p>
          <Link
            href={printHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary px-4 py-2 text-sm"
          >
            {t("filters.downloadPdf")}
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="font-semibold">{totals.joined}</span>{" "}
            <span className="text-muted-foreground">{t("totals.joinedLabel")}</span>
          </span>
          <span>
            <span className="font-semibold text-present">{totals.recited}</span>{" "}
            <span className="text-muted-foreground">{t("totals.recitedLabel")}</span>
          </span>
          <span>
            <span className="font-semibold text-accent-700 dark:text-accent-300">
              {totals.notRecited}
            </span>{" "}
            <span className="text-muted-foreground">{t("totals.notRecitedLabel")}</span>
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
          <>
            {/* Labels the same three numbers every row ends in, so reading
                them doesn't depend on hovering a `title` — which a touch
                screen cannot do anyway. */}
            <div className="mb-1.5 flex items-center gap-3 px-4 text-xs text-muted-foreground">
              <span className="w-8 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1" aria-hidden="true" />
              <div className="flex shrink-0 gap-3">
                <span className="w-8 text-center">{t("columns.joined")}</span>
                <span className="w-8 text-center">{t("columns.recited")}</span>
                <span className="w-8 text-center">{t("columns.notRecited")}</span>
              </div>
            </div>

            <ol className="scroll-list flex flex-col gap-2">
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
                    <span className="w-8 text-center text-muted-foreground">
                      {row.sessions_joined}
                    </span>
                    <span className="w-8 text-center text-present">
                      {row.sessions_recited}
                    </span>
                    <span
                      className={`w-8 text-center ${
                        Number(row.sessions_not_recited) > 0
                          ? "font-semibold text-accent-700 dark:text-accent-300"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.sessions_not_recited}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {t("results.legend")}
        </p>
      </section>
    </div>
  );
}
