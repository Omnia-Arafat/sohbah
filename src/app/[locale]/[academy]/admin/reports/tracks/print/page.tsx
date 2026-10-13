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

const C = {
  ink: "#14231C",
  muted: "#3F5248",
  rule: "#D5DFD8",
  green900: "#12382C",
  green700: "#1E6E51",
  green50: "#EDF7F2",
  green100: "#D3ECE0",
  gold: "#C4913A",
  goldSoft: "#F1D9A0",
  goldBg: "#FBF4E4",
  goldInk: "#5C4316",
  maroon: "#7A2433",
  maroonBg: "#FBEDEB",
  stripe: "#F6F9F7",
};

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
  const pct = (avg: number | null) => (avg === null ? 0 : Math.round((avg / 40) * 100));

  return (
    <div className="track-print mx-auto flex max-w-[794px] flex-col print:max-w-none" style={{ color: C.ink }}>
      <style>{`
        .track-print, .track-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          @page { size: A4; margin: 10mm; }
          .track-sheet { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; margin: 0 !important; min-height: 277mm !important; }
        }
      `}</style>

      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label={tReports("print.downloadButton")} />
      </div>

      <Sheet pageLabel={tp("page", { page: num.format(1), total: num.format(totalPages) })} footer={academyName}>
        <Band>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: C.goldSoft }}>
                {academyName}
              </p>
              <h1 className="font-display mt-1 text-[36px] font-bold leading-tight text-white">{t("title")}</h1>
              <p className="mt-1 text-sm" style={{ color: C.green100 }}>
                {rangeLabel} · {trackName ?? t("filters.allTracks")} ·{" "}
                {tp("cohortCount", { count: view.cohorts.length })}
              </p>
            </div>
            {academy.logo_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={academy.logo_path} alt="" className="h-16 w-16 shrink-0 rounded-full bg-white object-contain p-1" />
            ) : null}
          </div>
        </Band>

        <div className="px-8 pt-6">
          <div className="grid grid-cols-4 gap-2.5">
            <Kpi label={t("kpis.average")} bg={C.green50} fg={C.green700}>
              {view.average === null ? "—" : num.format(view.average)}
              <small className="ms-1 text-sm font-semibold" style={{ color: C.muted }}>
                / {num.format(40)}
              </small>
              <Bar value={pct(view.average)} />
            </Kpi>
            <Kpi label={t("kpis.done")} bg={C.green50} fg={C.green900}>
              {num.format(view.done)}
              <small className="ms-1 text-sm font-semibold" style={{ color: C.muted }}>
                {t("kpis.of", { due: num.format(view.due) })}
              </small>
            </Kpi>
            <Kpi label={t("kpis.missed")} bg={C.maroonBg} fg={C.maroon}>
              {num.format(view.missed)}
            </Kpi>
            <Kpi label={tp("noCards")} bg={C.goldBg} fg={C.goldInk}>
              {num.format(view.noCards)}
            </Kpi>
          </div>

          <h2 className="font-display mt-6 mb-2 text-xl font-bold" style={{ color: C.green900 }}>
            {tp("cohorts")}
          </h2>
          {view.cohorts.length === 0 ? (
            <p className="text-sm" style={{ color: C.muted }}>
              {t("results.empty")}
            </p>
          ) : (
            <table className="w-full border-collapse overflow-hidden rounded-lg text-[12.5px]">
              <thead>
                <tr style={{ background: C.green900, color: "#FFFFFF" }}>
                  <th className="px-2 py-2 text-start font-bold">{tp("cohort")}</th>
                  <th className="px-2 py-2 text-start font-bold">{tp("teacher")}</th>
                  <th className="w-14 px-1 py-2 text-center font-bold">{tp("students")}</th>
                  <th className="w-44 px-2 py-2 text-start font-bold">{tp("averageOf40")}</th>
                  <th className="w-14 px-1 py-2 text-center font-bold">{t("columns.missed")}</th>
                </tr>
              </thead>
              <tbody>
                {view.cohorts.map((c, i) => {
                  const tone = c.average === null ? null : scoreTone(c.average, 40);
                  return (
                    <tr
                      key={c.id}
                      style={{ background: i % 2 ? C.stripe : "#FFFFFF", borderBottom: `1px solid ${C.rule}` }}
                    >
                      <td className="px-2 py-1.5 font-semibold">
                        {c.trackName} · {c.name}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: C.muted }}>
                        {c.teacherName ?? "—"}
                      </td>
                      <td className="px-1 py-1.5 text-center tabular-nums">{num.format(c.students)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: C.green100 }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct(c.average)}%`, background: tone ? tone.bg : C.green700 }}
                            />
                          </div>
                          <span
                            className="min-w-11 rounded-md px-1.5 py-0.5 text-center font-extrabold tabular-nums"
                            style={tone ? { background: tone.bg, color: tone.fg } : undefined}
                          >
                            {c.average === null ? "—" : num.format(c.average)}
                          </span>
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <Pill danger={c.missed >= 10}>{num.format(c.missed)}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <Legend t={t} />

          <div
            className="mt-5 rounded-lg px-4 py-3 text-xs leading-relaxed"
            style={{ background: C.goldBg, color: C.goldInk, border: `1px solid #EAD7A8` }}
          >
            {tp("rules")} {tp("generatedOn", { date: generatedOn })}
          </div>
        </div>
      </Sheet>

      {view.cohorts.map((c, ci) => {
        const weeks = c.weeks.slice(-WEEK_COLUMNS);
        const offset = c.weeks.length - weeks.length;
        const details = c.rows.map((r) => rowById.get(r.enrollmentId)!);
        const followUp = details
          .filter((r) => r.missed >= 3 || (r.due > 0 && r.done === 0) || r.pendingExcuses > 0)
          .slice(0, 6);
        // The cohort's top three by score, ties included, whether or not
        // anyone reached a full 40 yet.
        const ranked = details
          .filter((r) => r.maxPoints > 0 && r.points > 0)
          .map((r) => ({
            id: r.enrollmentId,
            name: r.studentName,
            points: r.points,
            maxPoints: r.maxPoints,
            ratio: r.points / r.maxPoints,
            fullWeeks: r.weeks.filter(isFullWeek).map((w) => w.week),
          }))
          .sort((a, b) => b.ratio - a.ratio || b.points - a.points);
        const cutoff = ranked[Math.min(2, ranked.length - 1)]?.ratio ?? 1;
        const shining = ranked.filter((r) => r.ratio >= cutoff).slice(0, 6);
        const avgTone = c.average === null ? null : scoreTone(c.average, 40);

        return (
          <Sheet
            key={c.id}
            breakBefore
            pageLabel={tp("page", { page: num.format(ci + 2), total: num.format(totalPages) })}
            footer={`${academyName} · ${t("title")}`}
          >
            <Band>
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-xs font-bold" style={{ color: C.goldSoft }}>
                    {t("title")} · {rangeLabel}
                  </p>
                  <h1 className="font-display mt-1 text-[30px] font-bold leading-tight text-white">
                    {c.trackName} · {c.name}
                  </h1>
                  <p className="mt-1 text-[13px]" style={{ color: C.green100 }}>
                    {c.teacherName ? `${tp("teacherIs", { name: c.teacherName })} · ` : ""}
                    {t("focus.students", { count: c.students })}
                  </p>
                </div>
                <div
                  className="shrink-0 rounded-xl px-4 py-2 text-center"
                  style={{ background: avgTone?.bg === C.green900 ? C.goldSoft : (avgTone?.bg ?? "#FFFFFF") }}
                >
                  <div
                    className="text-[26px] font-extrabold leading-tight tabular-nums"
                    style={{ color: avgTone?.bg === C.green900 ? C.green900 : (avgTone?.fg ?? C.green900) }}
                  >
                    {c.average === null ? "—" : num.format(c.average)}
                  </div>
                  <div className="text-[11px] font-semibold" style={{ color: C.green900 }}>
                    {tp("cohortAverage")}
                  </div>
                </div>
              </div>
            </Band>

            <div className="px-8 pt-5">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="align-bottom" style={{ background: C.green900, color: "#FFFFFF" }}>
                    <th className="px-2 py-2 text-start font-bold">{t("focus.student")}</th>
                    {weeks.map((w) => (
                      <th key={w.week} className="px-1 py-2 text-center font-bold">
                        {t("focus.week", { week: num.format(w.week) })}
                        <div className="text-[10px] font-normal" style={{ color: C.green100 }}>
                          {w.open ? t("focus.running") : `${fmt(w.from, shortDate)} – ${fmt(w.to, shortDate)}`}
                        </div>
                      </th>
                    ))}
                    <th className="w-12 px-1 py-2 text-center font-bold" style={{ background: C.green700 }}>
                      {t("rules.recitation")}
                    </th>
                    <th className="w-12 px-1 py-2 text-center font-bold" style={{ background: C.gold }}>
                      {t("rules.meeting")}
                    </th>
                    <th className="w-16 px-1 py-2 text-center font-bold">{t("focus.total")}</th>
                    <th className="w-12 px-1 py-2 text-center font-bold">{t("columns.missed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r, ri) => (
                    <tr
                      key={r.enrollmentId}
                      style={{ background: ri % 2 ? C.stripe : "#FFFFFF", borderBottom: `1px solid ${C.rule}` }}
                    >
                      <th className="px-2 py-1.5 text-start font-semibold">{r.name}</th>
                      {r.cells.slice(offset).map((cell, i) => {
                        if (!cell || cell.max === 0) {
                          return (
                            <td key={i} className="px-1 py-1.5 text-center" style={{ color: C.muted }}>
                              —
                            </td>
                          );
                        }
                        const tone = scoreTone(cell.total, cell.max);
                        return (
                          <td key={i} className="px-1 py-1 text-center">
                            <span
                              className="inline-block min-w-[54px] rounded-md px-1 py-1 font-bold tabular-nums"
                              style={
                                cell.open
                                  ? { border: "1.5px dashed #8A9A91", color: C.muted }
                                  : { background: tone.bg, color: tone.fg }
                              }
                            >
                              {num.format(cell.total)}/{num.format(cell.max)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-1 py-1.5 text-center font-semibold tabular-nums" style={{ background: C.green50, color: C.green700 }}>
                        {num.format(r.recitation)}
                      </td>
                      <td className="px-1 py-1.5 text-center font-semibold tabular-nums" style={{ background: C.goldBg, color: C.goldInk }}>
                        {num.format(r.meeting)}
                      </td>
                      <td className="px-1 py-1.5 text-center font-extrabold tabular-nums">
                        {r.maxPoints > 0 ? `${num.format(r.points)}/${num.format(r.maxPoints)}` : "—"}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <Pill danger={r.missed >= 5}>{num.format(r.missed)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {offset > 0 && (
                <p className="mt-1.5 text-[11px]" style={{ color: C.muted }}>
                  {tp("olderWeeks", { count: offset })}
                </p>
              )}

              <Legend t={t} />

              <div className="mt-5 grid grid-cols-2 gap-3.5">
                <div className="rounded-xl px-4 py-3" style={{ background: C.maroonBg, border: `1px solid #EBC3BD` }}>
                  <h2 className="font-display mb-1.5 text-lg font-bold" style={{ color: C.maroon }}>
                    {tp("followUp")}
                  </h2>
                  {followUp.length === 0 ? (
                    <p className="text-[12.5px]" style={{ color: C.muted }}>
                      {tp("nobody")}
                    </p>
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
                <div className="rounded-xl px-4 py-3" style={{ background: C.goldBg, border: `1px solid #EAD7A8` }}>
                  <h2 className="font-display mb-1.5 text-lg font-bold" style={{ color: C.goldInk }}>
                    {tp("shining")}
                  </h2>
                  {shining.length === 0 ? (
                    <p className="text-[12.5px]" style={{ color: C.muted }}>
                      {tp("noFullWeeks")}
                    </p>
                  ) : (
                    <ul className="text-[12.5px] leading-[1.8]">
                      {shining.map((s) => (
                        <li key={s.id}>
                          <b>{s.name}</b> —{" "}
                          {tp("scoreLine", { points: num.format(s.points), max: num.format(s.maxPoints) })}
                          {s.fullWeeks.length > 0
                            ? ` · ${tp("fullIn", { weeks: s.fullWeeks.map((w) => num.format(w)).join("، ") })}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-10 px-8 pt-8 text-xs" style={{ color: C.muted }}>
              <div>
                <div className="h-8 border-b" style={{ borderColor: "#8A9A91" }} />
                <div className="mt-1.5">{tp("teacherSignature")}</div>
              </div>
              <div>
                <div className="h-8 border-b" style={{ borderColor: "#8A9A91" }} />
                <div className="mt-1.5">{tp("supervisorSignature")}</div>
              </div>
            </div>
          </Sheet>
        );
      })}
    </div>
  );
}

/** One A4 page: content, then a footer band. */
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
      className="track-sheet mb-6 flex min-h-[1090px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm"
      style={{ breakBefore: breakBefore ? "page" : undefined }}
    >
      <div className="flex flex-1 flex-col">{children}</div>
      <div
        className="mt-6 flex justify-between px-8 py-2.5 text-[11px] font-semibold"
        style={{ background: C.green900, color: C.green100 }}
      >
        <span>{footer}</span>
        <span>{pageLabel}</span>
      </div>
    </section>
  );
}

/** The dark green head of every page, with a gold rule under it. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="px-8 py-6" style={{ background: C.green900 }}>
        {children}
      </div>
      <div className="h-1.5" style={{ background: C.gold }} />
    </div>
  );
}

function Kpi({
  label,
  bg,
  fg,
  children,
}: {
  label: string;
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: bg }}>
      <div className="text-xs font-semibold" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="mt-0.5 text-[26px] font-extrabold leading-tight tabular-nums" style={{ color: fg }}>
        {children}
      </div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: C.green100 }}>
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: C.green700 }} />
    </div>
  );
}

function Pill({ danger, children }: { danger: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-block min-w-8 rounded-full px-2 py-0.5 text-center font-bold tabular-nums"
      style={danger ? { background: C.maroon, color: "#FFFFFF" } : { background: C.maroonBg, color: C.maroon }}
    >
      {children}
    </span>
  );
}

function Legend({ t }: { t: (key: string) => string }) {
  const items: [string, string][] = [
    ["#12382C", t("focus.legend.full")],
    ["#2F7D5B", t("focus.legend.high")],
    ["#A8D9C2", t("focus.legend.mid")],
    ["#EFE4C2", t("focus.legend.low")],
    ["#F4D9D6", t("focus.legend.poor")],
  ];
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: C.muted }}>
      {items.map(([color, text]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
          {text}
        </span>
      ))}
    </div>
  );
}
