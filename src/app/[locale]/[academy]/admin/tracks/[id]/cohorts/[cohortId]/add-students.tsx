"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { matchesSearch } from "@/lib/arabic-search";
import type { Candidate } from "@/lib/cohort-dal";
import { addStudents, type RosterState } from "./actions";

/** Matches past this many mean "type more", not "scroll more". */
const MAX_SHOWN = 12;

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  const t = useTranslations("cohort");
  return (
    <button
      type="submit"
      className="btn-primary w-full sm:w-auto"
      disabled={pending || count === 0}
    >
      {pending ? t("adding") : t("addCount", { count })}
    </button>
  );
}

/**
 * The picker for moving an existing cohort into the system.
 *
 * A هجرة of twenty students is twenty checkboxes and one save, not twenty
 * round trips — so the list is multi-select and the button carries the count.
 * Only students who are on no track at all appear (see listAddableStudents),
 * because the one-track rule is an index and an unchoosable name is noise.
 */
export function AddStudents({
  academySlug,
  trackId,
  cohortId,
  candidates,
  seatsLeft,
}: {
  academySlug: string;
  trackId: string;
  cohortId: string;
  candidates: Candidate[];
  seatsLeft: number | null;
}) {
  const t = useTranslations("cohort");
  const [state, formAction] = useActionState<RosterState, FormData>(addStudents, {
    error: null,
    added: 0,
  });

  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  /*
    Search first, and match the way the rest of the app does.

    Two things were wrong with listing everyone. A hundred and sixty-seven
    names in a 288px box is a scrollbar inside a scrollbar — on a phone the
    page and the list fight over the same drag. And `includes()` is the wrong
    test for Arabic: a معلمة typing "فاطمه" found nothing when the name on
    file was "فاطمة". matchesSearch folds exactly the letters that vary, and
    agrees with the database's own normalize_ar().

    So: nothing until she types, then a capped page of matches that the page
    itself scrolls.
  */
  const trimmed = query.trim();
  const matches = useMemo(() => {
    if (trimmed === "") return [];
    return candidates.filter(
      (c) =>
        matchesSearch(c.name, trimmed) || matchesSearch(c.fatherName, trimmed),
    );
  }, [candidates, trimmed]);

  const shown = matches.slice(0, MAX_SHOWN);

  // Kept in the candidate list's own order, so the chips do not reshuffle
  // themselves every time she picks another name.
  const chosenList = useMemo(
    () => candidates.filter((c) => chosen.has(c.id)),
    [candidates, chosen],
  );

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const overCapacity = seatsLeft !== null && chosen.size > seatsLeft;

  if (candidates.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        {t("noCandidates")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 px-4 py-4">
      <input type="hidden" name="academySlug" value={academySlug} />
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="cohortId" value={cohortId} />

      {state.error && (
        <p
          role="alert"
          className="rounded-xl border border-absent/40 bg-absent/5 px-3 py-2.5 text-sm text-absent"
        >
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.added > 0 && !state.error && (
        <p
          role="status"
          className="rounded-xl border border-present/40 bg-present/5 px-3 py-2.5 text-sm text-present"
        >
          {t("addedCount", { count: state.added })}
        </p>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="studentSearch">
          {t("search")}
        </label>
        <input
          id="studentSearch"
          type="search"
          className="input"
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/*
        The chosen, always in sight. Searching again replaces what is on the
        list below, so without this the count on the button would be the only
        evidence of who is already picked.

        These carry the value too, which is what makes searching safe: a
        student picked under one search is no longer rendered under the next,
        and an unrendered checkbox submits nothing. Her id travels in a hidden
        input instead, so the pick survives until save.
      */}
      {chosenList.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chosenList.map((candidate) => (
            <li key={candidate.id}>
              <input type="hidden" name="studentIds" value={candidate.id} />
              <button
                type="button"
                onClick={() => toggle(candidate.id)}
                aria-label={t("removeChosen", { name: candidate.name })}
                className="flex min-h-9 items-center gap-1.5 rounded-full bg-brand-600 px-3 text-xs font-semibold text-white"
              >
                {candidate.name}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {trimmed === "" ? (
        <p className="rounded-xl border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-muted-foreground">
          {t("searchHint", { count: candidates.length })}
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-border-subtle px-3 py-3 text-sm text-muted-foreground">
          {t("noMatch")}
        </p>
      ) : (
        <>
          <ul className="rounded-xl border border-border-subtle">
            {shown.map((candidate) => (
              <li
                key={candidate.id}
                className="border-b border-border-subtle last:border-b-0"
              >
                <label className="flex min-h-11 items-center gap-2.5 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={chosen.has(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span className="min-w-0 flex-grow truncate text-sm">
                    {candidate.name}
                    <span className="text-muted-foreground">
                      {" "}
                      {candidate.fatherName}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {matches.length > shown.length && (
            <p className="text-center text-xs text-muted-foreground">
              {t("narrowSearch", { count: matches.length - shown.length })}
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p
          className={`min-w-0 flex-grow text-xs ${
            overCapacity ? "font-semibold text-absent" : "text-muted-foreground"
          }`}
        >
          {seatsLeft === null
            ? t("seatsUnlimited")
            : overCapacity
              ? t("overCapacity", { seats: seatsLeft })
              : t("seatsLeft", { count: seatsLeft })}
        </p>
        <SubmitButton count={chosen.size} />
      </div>
    </form>
  );
}
