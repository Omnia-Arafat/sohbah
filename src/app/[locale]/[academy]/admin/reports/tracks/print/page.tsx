import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaffSession } from "@/lib/auth/dal";
import { getAcademyContext } from "@/lib/academy-context";
import { loadTrackReportForQuery, type TrackReportSearchParams } from "@/lib/track-report-query";
import { buildTrackReportView, isFullWeek, scoreTone } from "@/lib/track-report-view";
import { PrintButton } from "../../print/print-button";

type PrintPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<TrackReportSearchParams>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

/** The most recent weeks a cohort page has room for, side by side on A4. */
const WEEK_COLUMNS = 6;

export async function generateMetadata({
  params,
}: Pick<PrintPageProps, "params">): Promise<Metadata> {
  const { locale, academy: academySlug } = await params;
  const t = await getTranslations({ locale, namespace: "trackReport" });
  const academy = await getAcademyContext(academySlug);
  const academyName = academy ? (locale === "ar" ? academy.name_ar : academy.name_en) : "";
  return { title: academyName ? `${academyName} - ${t("title")}` : t("title") };
}

export default async function TrackReportPrintPage({ params, searchParams }: PrintPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("trackReport");
  const tp = await getTranslations("trackReport.print");
  const tReports = await getTranslations("reports");

  await requireStaffSession(`/${academySlug}/admin/reports/tracks/print`);

  const query = await searchParams;
  const { academy, range, tracks, trackId, report } = await loadTrackReportForQuery(academySlug, query);
  if (!academy) notFound();
  const view = buildTrackReportView(report);

  const ar = locale === "ar";
  const num = new Intl.NumberFormat(ar ? "ar-EG" : "en", { maximumFractionDigits: 1 });
  const longDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shortDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const fmt = (iso: string, f: Intl.DateTimeFormat) => f.format(new Date(`${iso}T00:00:00Z`));
  const rangeLabel = `${fmt(range.from, longDate)} – ${fmt(range.to, longDate)}`;
  const generatedOn = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", { dateStyle: "long" }).format(new Date());
  const academyName = ar ? academy.name_ar : academy.name_en;
  const trackName = trackId ? tracks.find(([id]) => id === trackId)?.[1] : null;

  const rowById = new Map(report.rows.map((r) => [r.enrollmentId, r]));
  const totalPages = 1 + view.cohorts.length;

  return (
    <div className="track-print mx-auto flex max-w-[794px] flex-col text-[#14231C] print:max-w-none">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 12mm 14mm; }
          .track-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .track-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; min-height: auto !important; }
        }
      `}</style>

      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label={tReports("print.downloadButton")} />
      </div>

      <Sheet pageLabel={tp("page", { page: num.format(1), total: num.format(totalPages) })} footer={academyName}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-bold text-brand-600">{academyName}</p>
            <h1 className="font-display mt-1 text-[34px] font-bold leading-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-[#3F5248]">
              {rangeLabel} · {trackName ?? t("filters.allTracks")} ·{" "}
              {tp("cohortCount", { count: view.cohorts.length })}
            </p>
          </div>
          {academy.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={academy.logo_path} alt="" className="h-16 w-16 shrink-0 object-contain" />
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2.5">
          <Box label={t("kpis.average")} tone="brand">
            {view.average === null ? "—" : num.format(view.average)}{" "}
            <small className="text-sm font-semibold text-[#3F5248]">/ {num.format(40)}</small>
          </Box>
          <Box label={t("kpis.done")}>
            {num.format(view.done)}{" "}
            <small className="text-sm font-semibold text-[#3F5248]">{t("kpis.of", { due: num.format(view.due) })}</small>
          </Box>
          <Box label={t("kpis.missed")} tone="absent">
            {num.format(view.missed)}
          </Box>
          <Box label={tp("noCards")} tone="absent">
            {num.format(view.noCards)}
          </Box>
        </div>

        <h2 className="font-display mt-6 mb-2 text-xl font-bold">{tp("cohorts")}</h2>
        {view.cohorts.length === 0 ? (
          <p className="text-sm text-[#3F5248]">{t("results.empty")}</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b-[1.5px] border-[#12382C]">
                <th className="px-1 py-1.5 text-start font-bold">{tp("cohort")}</th>
                <th className="px-1 py-1.5 text-start font-bold">{tp("teacher")}</th>
                <th className="w-14 px-1 py-1.5 text-center font-bold">{tp("students")}</th>
                <th className="w-44 px-1 py-1.5 text-start font-bold">{tp("averageOf40")}</th>
                <th className="w-12 px-1 py-1.5 text-center font-bold">{t("columns.missed")}</th>
              </tr>
            </thead>
            <tbody>
              {view.cohorts.map((c) => (
                <tr key={c.id} className="border-b border-[#D5DFD8]">
                  <td className="px-1 py-1.5 font-semibold">
                    {c.trackName} · {c.name}
                  </td>
                  <td className="px-1 py-1.5 text-[#3F5248]">{c.teacherName ?? "—"}</td>
                  <td className="px-1 py-1.5 text-center tabular-nums">{num.format(c.students)}</td>
                  <td className="px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E3ECE6]">
                        <div
                          className="h-full bg-brand-600"
                          style={{ width: `${c.average === null ? 0 : Math.round((c.average / 40) * 100)}%` }}
                        />
                      </div>
                      <span className="w-9 text-end font-extrabold tabular-nums">
                        {c.average === null ? "—" : num.format(c.average)}
                      </span>
                    </div>
                  </td>
                  <td
                    className="px-1 py-1.5 text-center font-bold tabular-nums"
                    style={{ color: c.missed >= 10 ? "#7A2433" : undefined }}
                  >
                    {num.format(c.missed)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-auto border-t border-[#C9D6CD] pt-3 text-xs leading-relaxed text-[#3F5248]">
          {tp("rules")} {tp("generatedOn", { date: generatedOn })}
        </p>
      </Sheet>

      {view.cohorts.map((c, ci) => {
        const weeks = c.weeks.slice(-WEEK_COLUMNS);
        const offset = c.weeks.length - weeks.length;
        const details = c.rows.map((r) => rowById.get(r.enrollmentId)!);
        const followUp = details
          .filter((r) => r.missed >= 3 || (r.due > 0 && r.done === 0) || r.pendingExcuses > 0)
          .slice(0, 6);
        const shining = details
          .map((r) => ({ name: r.studentName, weeks: r.weeks.filter(isFullWeek).map((w) => w.week) }))
          .filter((r) => r.weeks.length > 0)
          .slice(0, 6);

        return (
          <Sheet
            key={c.id}
            breakBefore
            pageLabel={tp("page", { page: num.format(ci + 2), total: num.format(totalPages) })}
            footer={`${academyName} · ${t("title")}`}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-xs font-bold text-brand-600">
                  {t("title")} · {rangeLabel}
                </p>
                <h1 className="font-display mt-1 text-[30px] font-bold leading-tight">
                  {c.trackName} · {c.name}
                </h1>
                <p className="mt-1 text-[13px] text-[#3F5248]">
                  {c.teacherName ? `${tp("teacherIs", { name: c.teacherName })} · ` : ""}
                  {t("focus.students", { count: c.students })}
                </p>
              </div>
              <div className="shrink-0 rounded-xl border-[1.5px] border-brand-600 px-4 py-2 text-center">
                <div className="text-2xl font-extrabold text-brand-600 tabular-nums">
                  {c.average === null ? "—" : num.format(c.average)}
                </div>
                <div className="text-[11px] font-semibold text-[#3F5248]">{tp("cohortAverage")}</div>
              </div>
            </div>

            <table className="mt-5 w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b-[1.5px] border-[#12382C] align-bottom">
                  <th className="px-1 py-1.5 text-start font-bold">{t("focus.student")}</th>
                  {weeks.map((w) => (
                    <th key={w.week} className="px-1 py-1.5 text-center font-bold">
                      {t("focus.week", { week: num.format(w.week) })}
                      <div className="text-[10px] font-normal text-[#3F5248]">
                        {w.open ? t("focus.running") : `${fmt(w.from, shortDate)} – ${fmt(w.to, shortDate)}`}
                      </div>
                    </th>
                  ))}
                  <th className="w-12 px-1 py-1.5 text-center font-bold">{t("rules.recitation")}</th>
                  <th className="w-12 px-1 py-1.5 text-center font-bold">{t("rules.meeting")}</th>
                  <th className="w-16 px-1 py-1.5 text-center font-bold">{t("focus.total")}</th>
                  <th className="w-10 px-1 py-1.5 text-center font-bold">{t("columns.missed")}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.enrollmentId} className="border-b border-[#D5DFD8]">
                    <th className="px-1 py-2 text-start font-semibold">{r.name}</th>
                    {r.cells.slice(offset).map((cell, i) => {
                      if (!cell || cell.max === 0) {
                        return (
                          <td key={i} className="px-1 py-2 text-center text-[#3F5248]">
                            —
                          </td>
                        );
                      }
                      const tone = scoreTone(cell.total, cell.max);
                      return (
                        <td
                          key={i}
                          className="px-1 py-2 text-center font-bold tabular-nums"
                          style={cell.open ? { color: "#3F5248" } : { background: tone.bg, color: tone.fg }}
                        >
                          {num.format(cell.total)}/{num.format(cell.max)}
                        </td>
                      );
                    })}
                    <td className="px-1 py-2 text-center tabular-nums">{num.format(r.recitation)}</td>
                    <td className="px-1 py-2 text-center tabular-nums">{num.format(r.meeting)}</td>
                    <td className="px-1 py-2 text-center font-extrabold tabular-nums">
                      {r.maxPoints > 0 ? `${num.format(r.points)}/${num.format(r.maxPoints)}` : "—"}
                    </td>
                    <td
                      className="px-1 py-2 text-center font-bold tabular-nums"
                      style={{ color: r.missed >= 5 ? "#7A2433" : undefined }}
                    >
                      {num.format(r.missed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {offset > 0 && (
              <p className="mt-1.5 text-[11px] text-[#3F5248]">{tp("olderWeeks", { count: offset })}</p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3.5">
              <div className="rounded-xl border border-[#C9D6CD] px-4 py-3">
                <h2 className="font-display mb-1.5 text-lg font-bold">{tp("followUp")}</h2>
                {followUp.length === 0 ? (
                  <p className="text-[12.5px] text-[#3F5248]">{tp("nobody")}</p>
                ) : (
                  <ul className="text-[12.5px] leading-[1.8]">
                    {followUp.map((r) => (
                      <li key={r.enrollmentId}>
                        <b>{r.studentName}</b> —{" "}
                        {r.due > 0 && r.done === 0
                          ? tp("noCardsFor", { count: r.missed })
                          : tp("missedDays", { count: r.missed })}
                        {r.pendingExcuses > 0 ? ` · ${t("pendingExcuses", { count: r.pendingExcuses })}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-[#C9D6CD] px-4 py-3">
                <h2 className="font-display mb-1.5 text-lg font-bold">{tp("shining")}</h2>
                {shining.length === 0 ? (
                  <p className="text-[12.5px] text-[#3F5248]">{tp("noFullWeeks")}</p>
                ) : (
                  <ul className="text-[12.5px] leading-[1.8]">
                    {shining.map((s) => (
                      <li key={s.name}>
                        <b>{s.name}</b> — {tp("fullIn", { weeks: s.weeks.map((w) => num.format(w)).join("، ") })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-10 pt-8 text-xs text-[#3F5248]">
              <div>
                <div className="h-8 border-b border-[#8A9A91]" />
                <div className="mt-1.5">{tp("teacherSignature")}</div>
              </div>
              <div>
                <div className="h-8 border-b border-[#8A9A91]" />
                <div className="mt-1.5">{tp("supervisorSignature")}</div>
              </div>
            </div>
          </Sheet>
        );
      })}
    </div>
  );
}

/** One A4 page: a band at the top, the content, and a footer line. */
function Sheet({
  children,
  breakBefore,
  pageLabel,
  footer,
}: {
  children: React.ReactNode;
  breakBefore?: boolean;
  pageLabel: string;
  footer: string;
}) {
  return (
    <section
      className="track-sheet mb-6 flex min-h-[1050px] flex-col overflow-hidden rounded-lg border border-border-subtle bg-white shadow-sm print:min-h-[265mm]"
      style={{ breakBefore: breakBefore ? "page" : undefined }}
    >
      <div className="h-2.5 bg-[#12382C]" />
      <div className="h-1 bg-[#C4913A]" />
      <div className="flex flex-1 flex-col px-10 pt-8 pb-6 print:px-2">
        {children}
        <div className="mt-6 flex justify-between border-t border-[#C9D6CD] pt-2.5 text-[11px] text-[#3F5248]">
          <span>{footer}</span>
          <span>{pageLabel}</span>
        </div>
      </div>
    </section>
  );
}

function Box({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "brand" | "absent";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#C9D6CD] px-3.5 py-3">
      <div className="text-xs font-semibold text-[#3F5248]">{label}</div>
      <div
        className="text-2xl font-extrabold leading-tight tabular-nums"
        style={{ color: tone === "brand" ? "#1E6E51" : tone === "absent" ? "#7A2433" : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
