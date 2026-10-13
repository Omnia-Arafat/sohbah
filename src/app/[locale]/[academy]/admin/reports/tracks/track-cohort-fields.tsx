"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BrandSelect } from "@/components/brand-select";
import { MultiSelectDropdown } from "@/components/multi-select";

type CohortOption = { id: string; trackId: string; label: string };

/**
 * The track and cohort pickers, kept in step: choosing a track narrows the
 * cohort list at once, without waiting for the form to be submitted.
 */
export function TrackCohortFields({
  tracks,
  cohorts,
  defaultTrackId,
  defaultCohortIds,
}: {
  tracks: { id: string; name: string }[];
  cohorts: CohortOption[];
  defaultTrackId: string;
  defaultCohortIds: string[];
}) {
  const t = useTranslations("trackReport.filters");
  const tReports = useTranslations("reports.filters");
  const [trackId, setTrackId] = useState(defaultTrackId);

  const options = cohorts.filter((c) => !trackId || c.trackId === trackId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="field-label" htmlFor="track">
          {t("track")}
        </label>
        <BrandSelect
          id="track"
          name="track"
          value={trackId}
          onValueChange={setTrackId}
          options={[
            { value: "", label: t("allTracks") },
            ...tracks.map((track) => ({ value: track.id, label: track.name })),
          ]}
        />
      </div>
      <div>
        <label className="field-label" htmlFor="cohort">
          {t("cohort")}
        </label>
        <MultiSelectDropdown
          key={trackId}
          id="cohort"
          name="cohort"
          options={options.map((c) => ({ value: c.id, label: c.label }))}
          defaultValues={trackId === defaultTrackId ? defaultCohortIds : []}
          allLabel={t("allCohorts", { count: options.length })}
          doneLabel={tReports("done")}
        />
      </div>
    </div>
  );
}
