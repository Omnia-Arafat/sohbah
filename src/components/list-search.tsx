"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { matchesSearch } from "@/lib/arabic-search";

/**
 * One input that filters an already-rendered list as you type.
 *
 * It hides the rows the server already sent rather than re-rendering them on
 * the client, so the cards keep their markup, their links and their server
 * translations — nothing about a circle is duplicated into client code just to
 * be searchable. A row opts in with `data-search="<the text to match>"`, and a
 * section wrapping rows with `data-search-section` disappears once all of its
 * rows are hidden, so an empty heading never sits there on its own.
 */
export function ListSearch({
  scopeId,
  placeholder,
  emptyText,
}: {
  /** id of the element containing the rows. */
  scopeId: string;
  placeholder: string;
  /** Shown under the field when nothing matches. */
  emptyText: string;
}) {
  const [empty, setEmpty] = useState(false);

  function filter(query: string) {
    const scope = document.getElementById(scopeId);
    if (!scope) return;

    let visible = 0;
    for (const row of scope.querySelectorAll<HTMLElement>("[data-search]")) {
      const match = matchesSearch(row.dataset.search ?? "", query);
      // `style.display` rather than the `hidden` attribute: these rows carry
      // `flex`/`grid` classes, which would win over `[hidden]`.
      row.style.display = match ? "" : "none";
      if (match) visible += 1;
    }

    for (const section of scope.querySelectorAll<HTMLElement>("[data-search-section]")) {
      const shown = [...section.querySelectorAll<HTMLElement>("[data-search]")].some(
        (row) => row.style.display !== "none",
      );
      section.style.display = shown ? "" : "none";
    }

    setEmpty(visible === 0);
  }

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 h-4 w-4
                     -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          className="input ps-11"
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => filter(event.target.value)}
        />
      </div>
      {empty && <p className="mt-2 text-sm text-muted-foreground">{emptyText}</p>}
    </div>
  );
}
