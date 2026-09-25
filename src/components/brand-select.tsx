"use client";

import { useEffect, useId, useRef, useState } from "react";

export type BrandSelectOption = {
  value: string;
  label: string;
  /** Rows with the same group sit under one heading, like an `<optgroup>`. */
  group?: string;
};

/**
 * The app's dropdown, in place of every native `<select>`.
 *
 * A native select opens the browser's own popup — a grey system sheet on a
 * phone — which is the one piece of every form that ignores the academy's
 * look. This draws the button and the panel with the app's own tokens, the way
 * `PhoneField` and `SearchableSelect` already do, minus the search box.
 *
 * Submits like a `<select>`: a hidden input named `name` carries the value, so
 * server actions read `formData.get(name)` unchanged. Uncontrolled with
 * `defaultValue`, or controlled with `value` + `onValueChange`. The root
 * carries `data-value`, so CSS can react to the choice (see `.range-form`).
 */
export function BrandSelect({
  id,
  name,
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  invalid,
  className = "",
}: {
  id: string;
  name?: string;
  options: BrandSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  invalid?: boolean;
  className?: string;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "");
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openPanel() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function commit(option: BrandSelectOption) {
    if (controlled === undefined) setOwn(option.value);
    setOpen(false);
    if (option.value !== value) onValueChange?.(option.value);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openPanel();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.min(Math.max(index + step, 0), options.length - 1));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && options[activeIndex]) commit(options[activeIndex]);
      else openPanel();
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} data-value={value}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleKeyDown}
        className={`input flex items-center gap-2 text-start ${invalid ? "border-absent" : ""}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ""}</span>
        <svg
          viewBox="0 0 12 8"
          aria-hidden="true"
          className={`h-2 w-3 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </button>

      {open && (
        <ul ref={listRef} id={listboxId} role="listbox" className="combobox-panel">
          {options.map((option, index) => {
            const heading =
              option.group && option.group !== options[index - 1]?.group ? option.group : null;
            return (
              <li key={option.value} role="presentation">
                {heading && (
                  <p className="px-4 pb-1 pt-3 text-xs font-bold text-brand-700 dark:text-brand-300">
                    {heading}
                  </p>
                )}
                <div
                  role="option"
                  data-index={index}
                  aria-selected={option.value === value}
                  // `click`, not `pointerdown`: on a phone a scroll begins with
                  // a finger on a row, and picking at pointer-down would shut
                  // the list before she could scroll it. See PhoneField.
                  onClick={() => commit(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`cursor-pointer px-4 py-3 text-base transition-colors ${
                    index === activeIndex
                      ? "bg-brand-50 text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                      : ""
                  } ${option.value === value ? "font-semibold" : ""}`}
                >
                  {option.label}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
