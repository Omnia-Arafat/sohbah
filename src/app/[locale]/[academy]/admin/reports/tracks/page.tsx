import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { BrandSelect } from "@/components/brand-select";
import { MultiSelectDropdown } from "@/components/multi-select";
import { ReportRangeFields, ReportTabs } from "@/components/report-range-fields";
import { requireStaffSession } from "@/lib/auth/dal";
import { getAcademyContext } from "@/lib/academy-context";
import { resolveRange } from "@/lib/report-range";
import { createClient } from "@/lib/supabase/server";
import {
  loadTrackReport,
  loadTrackReportCohorts,
  type TrackReportRow,
} from "@/lib/track-report";

type TrackReportPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{
    mode?: string;
    month?: string;
    weekMonth?: string;
    week?: string;
    year?: string;
    from?: string;
    to?: string;
    track?: string;
    cohort?: string | string[];
  }>;
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

export default async function TrackReportPage({
  params,
  searchParams,
}: TrackReportPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("trackReport");
  const tReports = await getTranslations("reports");

  await requireStaffSession(`/${academySlug}/admin/reports/tracks`);
  const academy = await getAcademyContext(academySlug);

  const query = await searchParams;
  const range = resolveRange(query);
  const supabase = await createClient();

  const { cohorts: allCohorts } = academy
    ? await loadTrackReportCohorts(supabase, academy.id)
    : { cohorts: [] };

  // Everything below comes from a user-editable URL: keep only ids that are
  // really this academy's.
  const tracks = [
    ...new Map(allCohorts.map((c) => [c.trackId, c.trackName])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const trackId = tracks.some(([id]) => id === query.track) ? query.track! : null;
  const cohortsForTrack = trackId
    ? allCohorts.filter((c) => c.trackId === trackId)
    : allCohorts;
  const cohortIds = (
    Array.isArray(query.cohort) ? query.cohort : query.cohort ? [query.cohort] : []
  ).filter((id) => cohortsForTrack.some((c) => c.id === id));

  const report = academy
    ? await loadTrackReport(supabase, academy.id, range, { trackId, cohortIds })
    : { cohorts: [], rows: [], error: false };

  const cohortLabel = (c: { trackName: string; name: string }) =>
    `${c.trackName} · ${c.name}`;

  // Per-cohort summary, in the same order as the filter list.
  const summaries = report.cohorts
    .map((cohort) => {
      const rows = report.rows.filter((r) => r.cohortId === cohort.id);
      const done = rows.reduce((n, r) => n + r.done, 0);
      const counted = rows.reduce((n, r) => n + r.due - r.excused, 0);
      return {
        cohort,
        students: rows.length,
        missed: rows.reduce((n, r) => n + r.missed, 0),
        commitment: counted > 0 ? Math.round((done / counted) * 100) : null,
      };
    })
    .filter((s) => s.students > 0);

  const cohortById = new Map(report.cohorts.map((c) => [c.id, c]));
  const totals = report.rows.reduce(
    (acc, r) => ({
      due: acc.due + r.due - r.excused,
      done: acc.done + r.done,
      missed: acc.missed + r.missed,
      pending: acc.pending + r.pendingExcuses,
    }),
    { due: 0, done: 0, missed: 0, pending: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{tReports("back")}</BackLink>
        <div className="mt-3">
          <ReportTabs academySlug={academySlug} active="tracks" />
        </div>
        <h1 className="font-display mt-3 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/* A plain GET form, like the attendance report: the state is the URL. */}
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
                { value: "", label: tReports("filters.all") },
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
                  ? `${cohortLabel(c)} (${c.teacherName})`
                  : cohortLabel(c),
              }))}
              defaultValues={cohortIds}
              allLabel={tReports("filters.all")}
              doneLabel={tReports("filters.done")}
            />
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("filters.cohortHint")}
            </p>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full sm:w-auto">
          {tReports("filters.apply")}
        </button>
      </form>

      {report.error && (
        <p className="card text-sm text-absent">{t("loadError")}</p>
      )}

      <section className="card">
        <p className="text-sm text-muted-foreground">
          {tReports("appliedRange", { from: range.from, to: range.to })}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="font-semibold text-present">{totals.done}</span>{" "}
            <span className="text-muted-foreground">
              {t("totals.done", { due: totals.due })}
            </span>
          </span>
          <span>
            <span className="font-semibold text-absent">{totals.missed}</span>{" "}
            <span className="text-muted-foreground">{t("totals.missed")}</span>
          </span>
          {totals.pending > 0 && (
            <span>
              <span className="font-semibold text-accent-700 dark:text-accent-300">
                {totals.pending}
              </span>{" "}
              <span className="text-muted-foreground">{t("totals.pending")}</span>
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("rule")}</p>
      </section>

      {summaries.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t("cohorts.title")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {summaries.map((s) => (
              <li key={s.cohort.id} className="card flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{cohortLabel(s.cohort)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {s.cohort.teacherName ?? ""}
                    {s.cohort.teacherName ? " · " : ""}
                    {t("cohorts.students", { count: s.students })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3 text-sm tabular-nums">
                  <Stat value={s.commitment === null ? "—" : `${s.commitment}%`} label={t("columns.commitment")} />
                  <Stat value={s.missed} label={t("columns.missed")} tone={s.missed > 0 ? "absent" : "muted"} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("results.title", { count: report.rows.length })}
        </h2>

        {report.rows.length === 0 ? (
          <p className="card text-muted-foreground">{t("results.empty")}</p>
        ) : (
          <ol className="scroll-list flex flex-col gap-2">
            {report.rows.map((row, index) => (
              <StudentRow
                key={row.enrollmentId}
                row={row}
                rank={index + 1}
                cohort={cohortById.get(row.cohortId)}
                cohortLabel={cohortLabel}
                statusLabel={
                  row.status === "active" ? null : t(`status.${row.status}`)
                }
                labels={{
                  commitment: t("columns.commitment"),
                  done: t("columns.done"),
                  missed: t("columns.missed"),
                  excused: t("columns.excused"),
                  meetings: t("columns.meetings"),
                  pending: (count: number) => t("pendingExcuses", { count }),
                }}
              />
            ))}
          </ol>
        )}

        <p className="mt-3 text-xs text-muted-foreground">{t("results.legend")}</p>
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  tone = "default",
}: {
  value: string | number;
  label: string;
  tone?: "default" | "present" | "absent" | "muted";
}) {
  const color = {
    default: "",
    present: "text-present",
    absent: "text-absent",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`font-semibold ${color}`}>{value}</span>
      <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

function StudentRow({
  row,
  rank,
  cohort,
  cohortLabel,
  statusLabel,
  labels,
}: {
  row: TrackReportRow;
  rank: number;
  cohort: { trackName: string; name: string } | undefined;
  cohortLabel: (c: { trackName: string; name: string }) => string;
  statusLabel: string | null;
  labels: {
    commitment: string;
    done: string;
    missed: string;
    excused: string;
    meetings: string;
    pending: (count: number) => string;
  };
}) {
  return (
    <li className="card flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {row.studentName}
            {statusLabel && (
              <span className="badge-waiting ms-2 text-xs font-normal">{statusLabel}</span>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {cohort ? cohortLabel(cohort) : ""}
            {row.pendingExcuses > 0 && (
              <span className="text-accent-700 dark:text-accent-300">
                {" · "}
                {labels.pending(row.pendingExcuses)}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 justify-around gap-3 text-sm tabular-nums sm:justify-start">
        <Stat
          value={row.commitment === null ? "—" : `${row.commitment}%`}
          label={labels.commitment}
        />
        <Stat value={`${row.done}/${row.due - row.excused}`} label={labels.done} tone="present" />
        <Stat value={row.missed} label={labels.missed} tone={row.missed > 0 ? "absent" : "muted"} />
        <Stat value={row.excused} label={labels.excused} tone="muted" />
        <Stat
          value={row.meetingsHeld === null ? "—" : `${row.meetings}/${row.meetingsHeld}`}
          label={labels.meetings}
        />
      </div>
    </li>
  );
}
