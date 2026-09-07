"use client";

import { useEffect, useId, useRef, useState } from "react";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthLabel(locale: string, monthIndex: number) {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, monthIndex, 1));
}

/**
 * A month+year picker that looks and works the same in every browser — a
 * native `<input type="month">` falls back to a plain text box with no
 * calendar at all in some browsers, which is worse than not offering a
 * native control in the first place.
 *
 * Submits like any other field: one `<input type="hidden" name={name}>`
 * carrying `YYYY-MM`, so the server reads it exactly as it would a native
 * month input's value.
 */
export function MonthYearPicker({
  id,
  name,
  defaultValue,
  locale,
}: {
  id: string;
  name: string;
  /** `YYYY-MM` */
  defaultValue: string;
  locale: string;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState(defaultValue);
  const [year, month] = value.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
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

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        id={id}
        type="button"
        className="input flex items-center justify-between gap-2 text-start"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setViewYear(year);
          setOpen((current) => !current);
        }}
      >
        <span>
          {monthLabel(locale, month - 1)} {year}
        </span>
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
        <div id={panelId} role="dialog" className="combobox-panel w-72 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setViewYear((current) => current - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg
                         transition-colors hover:bg-surface-muted"
            >
              ‹
            </button>
            <span className="font-semibold tabular-nums">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((current) => current + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg
                         transition-colors hover:bg-surface-muted"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, index) => {
              const isSelected = viewYear === year && index === month - 1;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setValue(`${viewYear}-${pad2(index + 1)}`);
                    setOpen(false);
                  }}
                  className={`truncate rounded-lg px-2 py-2 text-center text-xs transition-colors sm:text-sm ${
                    isSelected
                      ? "bg-brand-600 text-white"
                      : "hover:bg-surface-muted"
                  }`}
                >
                  {monthLabel(locale, index)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
