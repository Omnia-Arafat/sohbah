import { getAcademyContext } from "@/lib/academy-context";
import { resolveRange } from "@/lib/report-range";
import { createClient } from "@/lib/supabase/server";
import { loadTrackReport, loadTrackReportCohorts } from "@/lib/track-report";

export type TrackReportSearchParams = {
  mode?: string;
  month?: string;
  weekMonth?: string;
  week?: string;
  year?: string;
  from?: string;
  to?: string;
  track?: string;
  cohort?: string | string[];
};

/**
 * Resolves the filters from the URL against the academy's own cohorts, and
 * loads the report. Shared with the print page, which takes the same URL.
 */
export async function loadTrackReportForQuery(academySlug: string, query: TrackReportSearchParams) {
  const academy = await getAcademyContext(academySlug);
  const range = resolveRange(query);
  const supabase = await createClient();

  const { cohorts: allCohorts } = academy
    ? await loadTrackReportCohorts(supabase, academy.id)
    : { cohorts: [] };

  const tracks = [...new Map(allCohorts.map((c) => [c.trackId, c.trackName])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1], "ar"),
  );
  const trackId = tracks.some(([id]) => id === query.track) ? query.track! : null;
  const cohortsForTrack = trackId ? allCohorts.filter((c) => c.trackId === trackId) : allCohorts;
  const cohortIds = (
    Array.isArray(query.cohort) ? query.cohort : query.cohort ? [query.cohort] : []
  ).filter((id) => cohortsForTrack.some((c) => c.id === id));

  const report = academy
    ? await loadTrackReport(supabase, academy.id, range, { trackId, cohortIds })
    : { cohorts: [], rows: [], error: false };

  return { academy, range, tracks, trackId, cohortsForTrack, cohortIds, report };
}
