import type { TrackReport, TrackReportRow } from "@/lib/track-report";

export type ScoreCell = {
  week: number;
  total: number;
  max: number;
  open: boolean;
  /** The لقاء was marked, so the week can reach its full 40. */
  meetingMarked: boolean;
};

export type CohortView = {
  id: string;
  trackName: string;
  name: string;
  teacherName: string | null;
  students: number;
  /** Mean weekly score, scaled to 40; null when nothing was due. */
  average: number | null;
  missed: number;
  weeks: { week: number; from: string; to: string; open: boolean }[];
  rows: {
    enrollmentId: string;
    name: string;
    cells: (ScoreCell | null)[];
    points: number;
    maxPoints: number;
    recitation: number;
    meeting: number;
    missed: number;
    status: string;
  }[];
};

export type TrackReportView = {
  average: number | null;
  done: number;
  due: number;
  missed: number;
  noCards: number;
  fullWeeks: number;
  pending: number;
  cohorts: CohortView[];
};

export const WEEK_MAX = 40;

export function weekTotal(w: TrackReportRow["weeks"][number]) {
  return {
    total: w.recitation + (w.meeting ?? 0),
    max: w.recitationMax + (w.meetingMax ?? 0),
  };
}

export function isFullWeek(w: TrackReportRow["weeks"][number]) {
  const { total, max } = weekTotal(w);
  return w.meeting !== null && max > 0 && total === max;
}

function scaled(points: number, max: number) {
  return max > 0 ? Math.round((points / max) * WEEK_MAX * 10) / 10 : null;
}

export function buildTrackReportView(report: TrackReport): TrackReportView {
  const sum = (rows: TrackReportRow[], pick: (r: TrackReportRow) => number) =>
    rows.reduce((n, r) => n + pick(r), 0);

  const cohorts: CohortView[] = report.cohorts
    .map((cohort) => {
      const rows = report.rows.filter((r) => r.cohortId === cohort.id);
      const weekMap = new Map<number, { week: number; from: string; to: string; open: boolean }>();
      for (const r of rows) {
        for (const w of r.weeks) {
          if (!weekMap.has(w.week)) weekMap.set(w.week, { week: w.week, from: w.from, to: w.to, open: w.open });
        }
      }
      const weeks = [...weekMap.values()].sort((a, b) => a.week - b.week);
      return {
        id: cohort.id,
        trackName: cohort.trackName,
        name: cohort.name,
        teacherName: cohort.teacherName,
        students: rows.length,
        average: scaled(sum(rows, (r) => r.points), sum(rows, (r) => r.maxPoints)),
        missed: sum(rows, (r) => r.missed),
        weeks,
        rows: rows.map((r) => ({
          enrollmentId: r.enrollmentId,
          name: r.studentName,
          status: r.status,
          points: r.points,
          maxPoints: r.maxPoints,
          recitation: r.weeks.reduce((n, w) => n + w.recitation, 0),
          meeting: r.weeks.reduce((n, w) => n + (w.meeting ?? 0), 0),
          missed: r.missed,
          cells: weeks.map(({ week }) => {
            const w = r.weeks.find((x) => x.week === week);
            if (!w) return null;
            const { total, max } = weekTotal(w);
            return { week, total, max, open: w.open, meetingMarked: w.meeting !== null };
          }),
        })),
      };
    })
    .filter((c) => c.students > 0);

  return {
    average: scaled(sum(report.rows, (r) => r.points), sum(report.rows, (r) => r.maxPoints)),
    done: sum(report.rows, (r) => r.done),
    due: sum(report.rows, (r) => r.due - r.excused),
    missed: sum(report.rows, (r) => r.missed),
    noCards: report.rows.filter((r) => r.due > 0 && r.done === 0).length,
    fullWeeks: sum(report.rows, (r) => r.weeks.filter(isFullWeek).length),
    pending: sum(report.rows, (r) => r.pendingExcuses),
    cohorts,
  };
}

/**
 * The colour of a week's score, in five steps that differ in lightness as
 * well as hue, so they still read in grayscale and on paper.
 */
export function scoreTone(total: number, max: number) {
  const r = max > 0 ? total / max : 0;
  if (r >= 1) return { bg: "#12382C", fg: "#F1D9A0" };
  if (r >= 0.8) return { bg: "#2F7D5B", fg: "#FFFFFF" };
  if (r >= 0.6) return { bg: "#A8D9C2", fg: "#12382C" };
  if (r >= 0.4) return { bg: "#EFE4C2", fg: "#5C4316" };
  return { bg: "#F4D9D6", fg: "#7A2433" };
}
