"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * The roster's filters, applied as you type instead of on a "تصفية" button.
 *
 * This list is paged on the server — 117 students and an `ilike` in the query —
 * so it cannot use `<ListSearch>`, which hides rows the server already sent and
 * would only ever search the page you are looking at. The filter has to reach
 * the server, so this drives the URL and lets the page re-render.
 *
 * Typing is debounced: a keystroke per request would put six of them in flight
 * for "سارة". The gender select applies at once, since picking from it is
 * already a deliberate act.
 *
 * `router.replace` rather than `push` so the back button leaves the roster
 * instead of walking back through every letter that was typed.
 */
export function StudentsFilter({
  search,
  gender,
  labels,
}: {
  search: string;
  gender: string;
  labels: {
    searchLabel: string;
    searchPlaceholder: string;
    genderLabel: string;
    all: string;
    male: string;
    female: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [text, setText] = useState(search);
  const [sex, setSex] = useState(gender);

  /** The value currently reflected in the URL, so we never re-push the same one. */
  const applied = useRef({ search, gender });

  useEffect(() => {
    applied.current = { search, gender };
  }, [search, gender]);

  useEffect(() => {
    const unchanged =
      text === applied.current.search && sex === applied.current.gender;
    if (unchanged) return;

    // Immediate for the select, debounced for typing.
    const delay = sex !== applied.current.gender ? 0 : 300;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (text) params.set("search", text);
      if (sex) params.set("gender", sex);
      // Any change to the filter invalidates the page number: page 4 of the
      // unfiltered roster is not page 4 of the results.
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [text, sex, pathname, router]);

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      data-pending={isPending ? "" : undefined}
    >
      <div className="flex-1">
        <label htmlFor="search" className="field-label">
          {labels.searchLabel}
        </label>
        <input
          id="search"
          name="search"
          type="search"
          className="input"
          placeholder={labels.searchPlaceholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="sm:w-48">
        <label htmlFor="gender" className="field-label">
          {labels.genderLabel}
        </label>
        <select
          id="gender"
          name="gender"
          className="input"
          value={sex}
          onChange={(event) => setSex(event.target.value)}
        >
          <option value="">{labels.all}</option>
          <option value="male">{labels.male}</option>
          <option value="female">{labels.female}</option>
        </select>
      </div>
    </div>
  );
}
