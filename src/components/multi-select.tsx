"use client";

import { useEffect, useId, useRef, useState } from "react";

type Option = { value: string; label: string };

/**
 * A closed-by-default dropdown of checkboxes: click to open a panel, tick any
 * number of options, click elsewhere (or Escape, or "تم") to close. Built for
 * the reports filter's teacher picker — a native `<select multiple>` needs
 * ctrl/cmd-click to pick more than one and never shows what's chosen without
 * opening it, neither of which is obvious on a touch screen.
 *
 * Submits like any other form field: one `<input type="hidden" name={name}>`
 * per ticked option, so the server reads `formData.getAll(name)` exactly as
 * it would from a set of same-named checkboxes. Nothing renders when
 * `allValue` is the effective selection (empty ticks), which is what makes
 * "no filter" and "everything explicitly ticked" the same wire format.
 */
export function MultiSelectDropdown({
  id,
  name,
  options,
  defaultValues = [],
  allLabel,
  doneLabel,
}: {
  id: string;
  name: string;
  options: Option[];
  /** Empty means "all" — nothing is ticked and no hidden input is rendered. */
  defaultValues?: string[];
  allLabel: string;
  doneLabel: string;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggle(value: string) {
    setSelected((current) =>
      current.includes(value)
        ? current.filter((id) => id !== value)
        : [...current, value],
    );
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((option) => option.value === selected[0])?.label ?? allLabel
        : `${options.find((option) => option.value === selected[0])?.label ?? ""} +${selected.length - 1}`;

  return (
    <div ref={rootRef} className="relative">
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <button
        id={id}
        type="button"
        className="input flex items-center justify-between gap-2 text-start"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{summary}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panelId} role="listbox" aria-multiselectable="true" className="combobox-panel p-1">
          <label
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5
                       text-sm font-medium transition-colors hover:bg-surface-muted"
          >
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => setSelected([])}
              className="accent-brand-600"
            />
            {allLabel}
          </label>

          <div className="my-1 border-t border-border-subtle" />

          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5
                         text-sm transition-colors hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-brand-600"
              />
              {option.label}
            </label>
          ))}

          <div className="sticky bottom-0 mt-1 border-t border-border-subtle bg-surface pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-lg px-3 py-2 text-center text-sm font-semibold
                         text-brand-700 transition-colors hover:bg-surface-muted dark:text-brand-300"
            >
              {doneLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
