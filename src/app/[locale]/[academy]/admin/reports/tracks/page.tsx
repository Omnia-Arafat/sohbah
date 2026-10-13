import type { Metadata } from "next";
import { ChevronDown, Download } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { BrandSelect } from "@/components/brand-select";
import { MultiSelectDropdown } from "@/components/multi-select";
import { ReportRangeFields, ReportTabs } from "@/components/report-range-fields";
import { Link } from "@/i18n/navigation";
import { requireStaffSession } from "@/lib/auth/dal";
import type { DayStatus, TrackReportRow } from "@/lib/track-report";
import { loadTrackReportForQuery, type TrackReportSearchParams } from "@/lib/track-report-query";
import { buildTrackReportView, isFullWeek, weekTotal } from "@/lib/track-report-view";
import { CohortFocus } from "./cohort-focus";


type TrackReportPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<TrackReportSearchParams>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: Pick<TrackReportPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trackReport" });
  return { title: t("title") };
}

const DAY_STYLE: Record<DayStatus, string> = {
  done: "bg-brand-600",
  partial: "bg-brand-200",
  missed: "border-2 border-[#7A2433] bg-surface",
  excused: "bg-[#EFE4C2]",
  open: "border-[1.5px] border-dashed border-[#8A9A91] bg-surface",
};

export default async function TrackReportPage({ params, searchParams }: TrackReportPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("trackReport");
  const tReports = await getTranslations("reports");

  await requireStaffSession(`/${academySlug}/admin/reports/tracks`);

  const query = await searchParams;
  const { range, tracks, trackId, cohortsForTrack, cohortIds, report } =
    await loadTrackReportForQuery(academySlug, query);
  const view = buildTrackReportView(report);

  const ar = locale === "ar";
  const num = new Intl.NumberFormat(ar ? "ar-EG" : "en", { maximumFractionDigits: 1 });
  const longDate = new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const rangeLabel = `${longDate.format(new Date(`${range.from}T00:00:00Z`))} – ${longDate.format(
    new Date(`${range.to}T00:00:00Z`),
  )}`;

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
  if (trackId) printParams.set("track", trackId);
  cohortIds.forEach((id) => printParams.append("cohort", id));
  const printHref = `/${academySlug}/admin/reports/tracks/print?${printParams.toString()}`;

  const cohortById = new Map(report.cohorts.map((c) => [c.id, c]));
  const cohortLabel = (row: TrackReportRow) => {
    const c = cohortById.get(row.cohortId);
    return c ? `${c.trackName} · ${c.name}` : "";
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <section className="flex flex-col gap-3">
        <BackLink href={`/${academySlug}/admin`}>{tReports("back")}</BackLink>
        <ReportTabs academySlug={academySlug} active="tracks" />
      </section>

      <header className="rounded-3xl bg-brand-900 px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[32px] font-bold leading-tight sm:text-[44px]">
              {t("title")}
            </h1>
            <p className="mt-1 text-[15px] text-brand-100">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <span className="inline-flex items-center rounded-full border border-white/25 px-4 py-2 text-sm">
              {rangeLabel}
            </span>
            <Link
              href={printHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#F1D9A0] px-4 py-2 text-sm font-bold text-brand-900"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {tReports("filters.downloadPdf")}
            </Link>
          </div>
        </div>
      </header>

      <form className="range-form card flex flex-col gap-4">
        <ReportRangeFields range={range} locale={locale} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="track">
              {t("filters.track")}
            </label>
            <BrandSelect
              id="track"
              name="track"
              defaultValue={trackId ?? ""}
              options={[
                { value: "", label: t("filters.allTracks") },
                ...tracks.map(([id, name]) => ({ value: id, label: name })),
              ]}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cohort">
              {t("filters.cohort")}
            </label>
            <MultiSelectDropdown
              id="cohort"
              name="cohort"
              options={cohortsForTrack.map((c) => ({
                value: c.id,
                label: c.teacherName
                  ? `${c.trackName} · ${c.name} (${c.teacherName})`
                  : `${c.trackName} · ${c.name}`,
              }))}
              defaultValues={cohortIds}
              allLabel={t("filters.allCohorts", { count: cohortsForTrack.length })}
              doneLabel={tReports("filters.done")}
            />
          </div>
        </div>
        <button type="submit" className="btn-primary w-full sm:w-auto sm:self-start">
          {tReports("filters.apply")}
        </button>
      </form>

      {report.error && <p className="card text-sm text-absent">{t("loadError")}</p>}

      <section aria-label={t("kpis.label")} className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Kpi label={t("kpis.average")}>
          <span className="text-brand-700 dark:text-brand-200">
            {view.average === null ? "—" : num.format(view.average)}
          </span>
          <Unit>/ {num.format(40)}</Unit>
          {view.average !== null && (
            <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-brand-100 sm:mt-3 sm:h-2 dark:bg-brand-900">
              <span
                className="block h-full bg-brand-600"
                style={{ width: `${Math.round((view.average / 40) * 100)}%` }}
              />
            </span>
          )}
        </Kpi>
        <Kpi label={t("kpis.done")} note={t("kpis.doneNote")}>
          {num.format(view.done)}
          <Unit>{t("kpis.of", { due: num.format(view.due) })}</Unit>
        </Kpi>
        <Kpi
          label={t("kpis.missed")}
          note={view.noCards > 0 ? t("kpis.noCards", { count: view.noCards }) : undefined}
          noteTone="absent"
        >
          <span className="text-[#7A2433] dark:text-[#E8A39B]">{num.format(view.missed)}</span>
        </Kpi>
        <Kpi
          label={t("kpis.fullWeeks")}
          note={view.pending > 0 ? t("kpis.pending", { count: view.pending }) : undefined}
        >
          {num.format(view.fullWeeks)}
        </Kpi>
      </section>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        {view.cohorts.length > 0 ? (
          <CohortFocus cohorts={view.cohorts} />
        ) : (
          <p className="card text-muted-foreground lg:flex-[999_1_640px]">{t("results.empty")}</p>
        )}

        <aside className="flex flex-col gap-4 lg:flex-[1_1_300px]">
          <div className="card">
            <h2 className="font-display text-[22px] font-bold">{t("rules.title")}</h2>
            <div className="mt-3 flex h-3.5 overflow-hidden rounded-full" aria-hidden="true">
              <span className="block h-full w-[62.5%] bg-brand-600" />
              <span className="block h-full w-[37.5%] bg-accent-500" />
            </div>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <div className="flex justify-between gap-3 font-bold">
                  <dt className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" aria-hidden="true" />
                    {t("rules.recitation")}
                  </dt>
                  <dd className="font-extrabold">{num.format(25)}</dd>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{t("rules.recitationNote")}</p>
              </div>
              <div>
                <div className="flex justify-between gap-3 font-bold">
                  <dt className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-accent-500" aria-hidden="true" />
                    {t("rules.meeting")}
                  </dt>
                  <dd className="font-extrabold">{num.format(15)}</dd>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{t("rules.meetingNote")}</p>
              </div>
              <div className="flex justify-between gap-3 border-t border-border-subtle pt-3 font-extrabold">
                <dt>{t("rules.week")}</dt>
                <dd className="text-brand-700 dark:text-brand-200">{num.format(40)}</dd>
              </div>
            </dl>
          </div>
          <p className="rounded-2xl border border-accent-300 bg-accent-100 px-4 py-3.5 text-[13px] leading-relaxed text-accent-700 dark:border-accent-700 dark:bg-accent-700/20 dark:text-accent-200">
            {t("rules.counting")}
          </p>
        </aside>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
          <h2 className="font-display text-2xl font-bold">{t("ranking.title")}</h2>
          <span className="text-sm text-muted-foreground">
            {t("ranking.count", { count: report.rows.length })}
          </span>
        </div>

        {report.rows.length === 0 ? (
          <p className="px-5 py-6 text-muted-foreground">{t("results.empty")}</p>
        ) : (
          <ol className="scroll-list">
            {report.rows.map((row, index) => {
              const recitation = row.weeks.reduce((n, w) => n + w.recitation, 0);
              const meeting = row.weeks.reduce((n, w) => n + (w.meeting ?? 0), 0);
              const pct = (v: number) => (row.maxPoints > 0 ? (v / row.maxPoints) * 100 : 0);
              const rankTone =
                index === 0
                  ? "bg-brand-900 text-[#F1D9A0]"
                  : index < 3
                    ? "bg-brand-100 text-brand-900 dark:bg-brand-800 dark:text-brand-100"
                    : "bg-surface-muted";
              return (
                <li key={row.enrollmentId} className="border-t border-border-subtle first:border-t-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 group-open:bg-surface-muted sm:px-5 [&::-webkit-details-marker]:hidden">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums ${rankTone}`}
                      >
                        {num.format(index + 1)}
                      </span>
                      <span className="min-w-0 flex-[1_1_180px]">
                        <span className="block truncate text-[15px] font-bold">
                          {row.studentName}
                          {row.status !== "active" && (
                            <span className="badge-waiting ms-2 text-xs font-normal">
                              {t(`status.${row.status}`)}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {cohortLabel(row)}
                          {row.pendingExcuses > 0 && (
                            <span className="text-accent-700 dark:text-accent-300">
                              {" · "}
                              {t("pendingExcuses", { count: row.pendingExcuses })}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex min-w-[150px] flex-[1_1_180px] flex-col gap-1.5">
                        <span className="flex justify-between text-[13px]">
                          <span className="text-muted-foreground">{t("columns.score")}</span>
                          <span className="font-extrabold tabular-nums">
                            {row.maxPoints > 0
                              ? `${num.format(row.points)} / ${num.format(row.maxPoints)}`
                              : "—"}
                          </span>
                        </span>
                        <span className="flex h-2 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900">
                          <span className="block h-full bg-brand-600" style={{ width: `${pct(recitation)}%` }} />
                          <span className="block h-full bg-accent-500" style={{ width: `${pct(meeting)}%` }} />
                        </span>
                      </span>
                      {row.recentDays.length > 0 && (
                        <span className="flex items-center gap-1" title={t("columns.days")}>
                          {row.recentDays.map((status, i) => (
                            <span key={i} className={`h-[18px] w-[18px] rounded-[5px] ${DAY_STYLE[status]}`}>
                              <span className="sr-only">{t(`days.${status}`)}</span>
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="flex gap-4 tabular-nums">
                        <span className="text-center">
                          <span
                            className={`block font-extrabold ${
                              row.missed > 0 ? "text-[#7A2433] dark:text-[#E8A39B]" : "text-muted-foreground"
                            }`}
                          >
                            {num.format(row.missed)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{t("columns.missed")}</span>
                        </span>
                        <span className="text-center">
                          <span className="block font-extrabold">
                            {row.meetingsHeld === null
                              ? "—"
                              : `${num.format(row.meetings)} / ${num.format(row.meetingsHeld)}`}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{t("columns.meetings")}</span>
                        </span>
                      </span>
                      <ChevronDown
                        className="h-[18px] w-[18px] text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="grid gap-2.5 bg-surface-muted px-4 pb-4 pt-1 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] sm:px-5 sm:ps-[68px]">
                      {row.weeks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("ranking.noWeeks")}</p>
                      ) : (
                        row.weeks.map((w) => {
                          const { total, max } = weekTotal(w);
                          return (
                            <div key={w.week} className="rounded-xl border border-border-subtle bg-surface px-3.5 py-3 text-[13px]">
                              <div className="flex justify-between font-bold">
                                <span>
                                  {t("focus.week", { week: num.format(w.week) })}
                                  {isFullWeek(w) && <span className="ms-1.5 text-accent-700 dark:text-accent-300">{t("ranking.full")}</span>}
                                </span>
                                <span className="tabular-nums">
                                  {num.format(total)} / {num.format(max)}
                                </span>
                              </div>
                              <div className="mt-1.5 flex justify-between text-muted-foreground">
                                <span>{t("rules.recitation")}</span>
                                <span className="tabular-nums">
                                  {num.format(w.recitation)} / {num.format(w.recitationMax)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex justify-between text-muted-foreground">
                                <span>{t("rules.meeting")}</span>
                                <span className="tabular-nums">
                                  {w.meeting === null
                                    ? t("ranking.unmarked")
                                    : `${num.format(w.meeting)} / ${num.format(w.meetingMax ?? 0)}`}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">{t("results.legend")}</p>
    </div>
  );
}

function Kpi({
  label,
  note,
  noteTone,
  children,
}: {
  label: string;
  note?: string;
  noteTone?: "absent";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface px-3.5 py-3 sm:px-5 sm:py-4">
      <div className="text-xs font-semibold text-muted-foreground sm:text-[13px]">{label}</div>
      <div className="mt-1 text-[26px] font-extrabold leading-tight tabular-nums sm:text-4xl">{children}</div>
      {note && (
        <div
          className={`mt-2 hidden text-[13px] sm:block ${
            noteTone === "absent" ? "font-semibold text-[#7A2433] dark:text-[#E8A39B]" : "text-muted-foreground"
          }`}
        >
          {note}
        </div>
      )}
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ms-1.5 text-[13px] font-semibold text-muted-foreground sm:text-base">{children}</span>;
}
