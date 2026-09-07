import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaffSession } from "@/lib/auth/dal";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { getAcademyContext } from "@/lib/academy-context";
import type { AttendanceReportRow, GenderCategory, Teacher } from "@/lib/database.types";
import { loadCircleTypes } from "@/lib/circle-types";
import { resolveRange } from "@/lib/report-range";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

type PrintReportPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{
    mode?: string;
    month?: string;
    weekMonth?: string;
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
}: Pick<PrintReportPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reports" });
  return { title: t("title") };
}

export default async function PrintReportPage({
  params,
  searchParams,
}: PrintReportPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("reports");
  const tDashboard = await getTranslations("dashboard");
  const tCircle = await getTranslations("circle");

  await requireStaffSession(`/${academySlug}/admin/reports/print`);

  const academy = await getAcademyContext(academySlug);
  if (!academy) notFound();

  const query = await searchParams;
  const range = resolveRange(query);

  // Same validation as the report page — this URL is just as user-editable.
  const gender: GenderCategory | null =
    query.gender === "male" || query.gender === "female" ? query.gender : null;
  const teacherIds = (Array.isArray(query.teacher) ? query.teacher : query.teacher ? [query.teacher] : [])
    .filter((id) => UUID.test(id));

  const supabase = await createClient();
  const [circleTypes, teachersResult] = await Promise.all([
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
    supabase.from("teachers").select("*").eq("academy_id", academy.id),
  ]);

  const circleType = circleTypes.some((option) => option.slug === query.type)
    ? (query.type as string)
    : null;

  const { data: reportRows, error: reportError } = await supabase.rpc(
    "attendance_report",
    {
      p_from: range.from,
      p_to: range.to,
      p_gender: gender,
      p_teacher_ids: teacherIds.length > 0 ? teacherIds : null,
      p_academy_id: academy.id,
      p_circle_type: circleType,
    },
  );

  if (reportError) console.error("attendance_report failed", reportError);

  const rows: AttendanceReportRow[] = reportRows ?? [];
  const teachers: Teacher[] = teachersResult.data ?? [];

  function teacherName(id: string) {
    const teacher = teachers.find((candidate) => candidate.id === id);
    return teacher
      ? getTeacherDisplayLabel(teacher, academySlug, locale)
      : t("filters.unknownTeacher");
  }

  const circleTypeOption = circleType
    ? circleTypes.find((option) => option.slug === circleType)
    : null;

  const totals = rows.reduce(
    (acc, row) => ({
      joined: acc.joined + Number(row.sessions_joined),
      recited: acc.recited + Number(row.sessions_recited),
      notRecited: acc.notRecited + Number(row.sessions_not_recited),
    }),
    { joined: 0, recited: 0, notRecited: 0 },
  );

  const academyName = locale === "ar" ? academy.name_ar : academy.name_en;
  const generatedOn = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  // Every filter that narrows the report gets one line here, so the printed
  // page alone documents exactly what it covers — nobody has to remember or
  // guess after the fact what "40" meant.
  const filterLines: string[] = [
    `${t("filters.mode")}: ${t(`filters.modes.${range.mode}`)} (${range.from} – ${range.to})`,
  ];
  if (circleTypeOption) {
    filterLines.push(
      `${t("filters.type")}: ${locale === "ar" ? circleTypeOption.name_ar : circleTypeOption.name_en}`,
    );
  }
  if (teacherIds.length > 0) {
    filterLines.push(
      `${t("filters.teacher")}: ${teacherIds.map(teacherName).join("، ")}`,
    );
  }
  if (gender) {
    filterLines.push(`${t("filters.gender")}: ${tDashboard(`gender.${gender}`)}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 print:max-w-none">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print.downloadButton")} />
      </div>

      <header
        className="flex items-center gap-4 border-b-2 pb-4"
        style={{ borderColor: academy.primary_color }}
      >
        {academy.logo_path ? (
          // A plain <img>, not next/image: print rendering needs the real
          // pixels immediately, not a lazy-loaded/optimized placeholder.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={academy.logo_path}
            alt={academyName}
            className="h-14 w-14 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h1
            className="font-display truncate text-xl font-bold"
            style={{ color: academy.primary_color }}
          >
            {academyName}
          </h1>
          <p className="text-sm text-muted-foreground">{t("title")}</p>
        </div>
      </header>

      <section className="text-sm text-muted-foreground">
        {filterLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="mt-1">{t("print.generatedOn", { date: generatedOn })}</p>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-foreground text-start">
            <th className="px-2 py-2 text-start">#</th>
            <th className="px-2 py-2 text-start">{t("print.studentColumn")}</th>
            <th className="px-2 py-2 text-center">{t("columns.joined")}</th>
            <th className="px-2 py-2 text-center">{t("columns.recited")}</th>
            <th className="px-2 py-2 text-center">{t("columns.notRecited")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.student_id}
              className="border-b border-border-subtle"
              style={{ breakInside: "avoid" }}
            >
              <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                {index + 1}
              </td>
              <td className="px-2 py-1.5">
                <span className="font-medium">{row.student_name}</span>
                <span className="ms-1.5 text-xs text-muted-foreground">
                  {tCircle("search.fatherLabel", { name: row.father_name })}
                </span>
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {row.sessions_joined}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {row.sessions_recited}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {row.sessions_not_recited}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-foreground font-semibold">
            <td className="px-2 py-2" colSpan={2}>
              {t("print.totalsLabel")}
            </td>
            <td className="px-2 py-2 text-center tabular-nums">{totals.joined}</td>
            <td className="px-2 py-2 text-center tabular-nums">{totals.recited}</td>
            <td className="px-2 py-2 text-center tabular-nums">{totals.notRecited}</td>
          </tr>
        </tfoot>
      </table>

      {rows.length === 0 && (
        <p className="text-center text-muted-foreground">{t("results.empty")}</p>
      )}
    </div>
  );
}
