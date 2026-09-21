"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { Candidate } from "@/lib/cohort-dal";
import { addStudents, type RosterState } from "./actions";

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

  const shown = useMemo(() => {
    const q = query.trim();
    if (q === "") return candidates;
    return candidates.filter(
      (c) => c.name.includes(q) || c.fatherName.includes(q),
    );
  }, [candidates, query]);

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

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border-subtle">
        {shown.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {t("noMatch")}
          </p>
        ) : (
          <ul>
            {shown.map((candidate) => (
              <li
                key={candidate.id}
                className="border-b border-border-subtle last:border-b-0"
              >
                <label className="flex min-h-11 items-center gap-2.5 px-3 py-2">
                  <input
                    type="checkbox"
                    name="studentIds"
                    value={candidate.id}
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
        )}
      </div>

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
