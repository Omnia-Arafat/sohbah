"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

/** "2026-10-04" → "4/10/2026": day first, Latin digits, no leading zeros. */
function display(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${Number(day)}/${Number(month)}/${year}`;
}

/**
 * A date input that always reads as 4/10/2026.
 *
 * A native <input type="date"> draws its own text in the browser's locale. On
 * a phone set to Arabic that is Arabic digits and separators inside a field
 * that is laid out left-to-right, and the day, month and year ran into each
 * other. So the field shows the date itself, and the native input sits over it
 * — invisible, still the thing that is focused, labelled and submitted — so a
 * tap opens the phone's own date picker as before.
 *
 * Uncontrolled with `defaultValue` (a plain form field), or controlled with
 * `value` and `onChange`.
 */
export function DateField({
  id,
  name,
  defaultValue,
  value,
  onChange,
  min,
  max,
  required,
  placeholder = "d/m/yyyy",
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const current = value ?? own;
  const shown = display(current);

  return (
    <div className="group relative">
      <div
        aria-hidden="true"
        className="input flex items-center justify-between gap-2 group-focus-within:border-brand-600
                   group-focus-within:ring-2 group-focus-within:ring-brand-200"
      >
        <span dir="ltr" className={`tabular-nums ${shown ? "" : "text-muted-foreground"}`}>
          {shown || placeholder}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <input
        id={id}
        name={name}
        type="date"
        value={current}
        min={min}
        max={max}
        required={required}
        onChange={(event) => {
          setOwn(event.target.value);
          onChange?.(event.target.value);
        }}
        // Desktop browsers open the calendar only from their own icon; open
        // it from anywhere on the field, since that icon is not visible here.
        onClick={(event) => event.currentTarget.showPicker?.()}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
