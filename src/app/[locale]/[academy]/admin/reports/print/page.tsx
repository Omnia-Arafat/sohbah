import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
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
  const { locale, academy: academySlug } = await params;
  const t = await getTranslations({ locale, namespace: "reports" });
  const academy = await getAcademyContext(academySlug);

  // A fixed name, not one that changes with the filters on screen: "Save as
  // PDF" suggests the document's <title> as the file name, and a name that
  // moved every time someone narrowed the report would be harder to find
  // again than a plain, predictable one.
  const academyName = academy ? (locale === "ar" ? academy.name_ar : academy.name_en) : "";
  return { title: academyName ? `${academyName} - ${t("title")}` : t("title") };
}

export default async function PrintReportPage({
  params,
  searchParams,
}: PrintReportPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("reports");
  const tDashboard = await getTranslations("dashboard");

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
        className="-mx-6 flex items-center gap-4 px-6 py-5 print:mx-0"
        style={{ backgroundColor: `${academy.primary_color}14` }}
      >
        {academy.logo_path ? (
          // A plain <img>, not next/image: print rendering needs the real
          // pixels immediately, not a lazy-loaded/optimized placeholder.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={academy.logo_path}
            alt={academyName}
            className="h-16 w-16 shrink-0 rounded-full bg-surface object-contain p-1.5 shadow-sm"
          />
        ) : null}
        <div className="min-w-0">
          <h1
            className="font-display truncate text-2xl font-bold"
            style={{ color: academy.primary_color }}
          >
            {academyName}
          </h1>
          <p className="text-sm font-medium text-muted-foreground">{t("title")}</p>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-2 text-sm">
        {filterLines.map((line) => (
          <span
            key={line}
            className="rounded-full border border-border-subtle bg-surface-muted px-3 py-1
                       text-muted-foreground"
          >
            {line}
          </span>
        ))}
        <span className="ms-auto text-xs text-muted-foreground print:ms-0 print:w-full">
          {t("print.generatedOn", { date: generatedOn })}
        </span>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-start" style={{ borderBottom: `2px solid ${academy.primary_color}` }}>
            <th className="px-2 py-2 text-start">#</th>
            <th className="px-2 py-2 text-start">{t("print.studentColumn")}</th>
            <th className="px-2 py-2 text-center">{t("columns.joined")}</th>
            <th className="px-2 py-2 text-center">{t("columns.recited")}</th>
            <th className="px-2 py-2 text-center">{t("columns.notRecited")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            // Matches the same ranking treatment as the on-screen report —
            // #1 gets a star, #2-5 a lighter version of it — so the PDF and
            // the page it came from read as the same document.
            const isFirst = index === 0;
            const isTopFive = index < 5;

            return (
              <tr
                key={row.student_id}
                className="border-b border-border-subtle"
                style={{
                  breakInside: "avoid",
                  backgroundColor: isFirst
                    ? "#fef3c7"
                    : isTopFive
                      ? `${academy.primary_color}0d`
                      : index % 2 === 1
                        ? "var(--color-surface-muted)"
                        : undefined,
                }}
              >
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                  {isFirst ? (
                    <Star
                      className="h-4 w-4 text-amber-500"
                      fill="currentColor"
                      aria-label="1"
                    />
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="px-2 py-1.5 font-medium">{row.student_name}</td>
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
            );
          })}
        </tbody>
        <tfoot>
          <tr
            className="font-semibold"
            style={{ borderTop: `2px solid ${academy.primary_color}` }}
          >
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
