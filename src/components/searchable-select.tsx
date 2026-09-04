"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesSearch } from "@/lib/arabic-search";

type Option = { value: string; label: string };

/**
 * A single-select combobox: type to filter, arrow keys to move, enter to
 * pick. Built for exactly one recurring case in this app — picking one name
 * out of a growing list of teachers — where a native `<select>` cannot do
 * either a search box or a bounded, scrollable panel; every browser renders
 * its own unstyled popup, full list, no filtering.
 *
 * Submits like any other form field: the visible text box is presentation
 * only, and a hidden `<input type="hidden" name={name}>` carries the actual
 * chosen `value` — so the server action on the other end needs no change,
 * it still reads `formData.get(name)` exactly as it did with a `<select>`.
 *
 * Deliberately holds no "displayed text" state of its own. While closed, the
 * box shows the selected option's label — a plain derivation from `value`,
 * recomputed every render, never stored — and while open, it shows the
 * in-progress search text (`draft`), which exists only for the search and is
 * discarded the moment the panel closes. That split means closing the panel
 * (click elsewhere, Escape, or a pick) is enough by itself to put the right
 * text back on screen — no effect has to reconcile two copies of it.
 */
export function SearchableSelect({
  id,
  name,
  options,
  defaultValue,
  placeholder,
  noMatches,
  required,
}: {
  id: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  /** Shown in the panel when typing matches nothing. */
  noMatches: string;
  required?: boolean;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";

  // Same matching as every other search in the app: spelling variants fold
  // together and a title in front of the name is ignored, so "معلمه وسام"
  // still finds "وسام لطفي".
  const filtered = useMemo(
    () => options.filter((option) => matchesSearch(option.label, draft)),
    [options, draft],
  );

  // Registers a listener on mount/while open; the setState it triggers lives
  // in the callback, not the effect body, so this is the ordinary "subscribe
  // to an outside event" case, not the one the state-in-effect rule flags.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function commit(option: Option) {
    setValue(option.value);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setDraft("");
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[activeIndex]) {
        event.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={open ? draft : selectedLabel}
        onFocus={() => {
          // A fresh search rather than editing the current name — the whole
          // list shows unfiltered, exactly like a native select popping open.
          setOpen(true);
          setDraft("");
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <ul id={listboxId} role="listbox" className="combobox-panel">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">{noMatches}</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onPointerDown={(event) => {
                  // Fires before the input's blur, so the click always lands
                  // before the outside-click handler would otherwise close
                  // the panel and discard the selection.
                  event.preventDefault();
                  commit(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-4 py-3 text-base transition-colors ${
                  index === activeIndex
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                    : ""
                } ${option.value === value ? "font-semibold" : ""}`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
