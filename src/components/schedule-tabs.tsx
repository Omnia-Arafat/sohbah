"use client";

import { useId, useRef, useState } from "react";

export type ScheduleTab = {
  id: string;
  label: string;
  /** Circles on that board — the number that makes a tab worth tapping. */
  count: number;
};

/**
 * The public timetable as tabs rather than one board after another.
 *
 * Four boards stacked vertically ran to nearly 3000px, and the first of them —
 * تصحيح التلاوة, 18 circles over seven days — buried the rest so completely
 * that they read as missing. A reader looking for حلقة الحديث should not have
 * to scroll past eighteen other circles to find out it is there.
 *
 * Every board is rendered and kept in the DOM; the tab only changes which one
 * is shown. Switching is therefore instant and costs no request — the data was
 * already fetched in one query for the whole page, so there is nothing to
 * fetch on a tap.
 *
 * NOTE ON JAVASCRIPT: with scripts blocked, only the first board is visible.
 * That is a real trade, made deliberately — the rest of this app (joining a
 * circle, the live queue, the student search) already requires JavaScript, so
 * the timetable was the only page that did not, and instant switching on a
 * phone is worth more here than a no-JS path nobody reaches.
 */
export function ScheduleTabs({
  tabs,
  children,
}: {
  tabs: ScheduleTab[];
  /** One pre-rendered board per tab, in the same order. */
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Arrow keys move between tabs, which is what a tablist is expected to do —
   * and `dir="rtl"` already flips which physical key means "next", so Left and
   * Right are mapped by meaning rather than by name.
   */
  function onKeyDown(event: React.KeyboardEvent) {
    const forward = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
    if (forward === 0) return;
    event.preventDefault();
    const next = (active + forward + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        // Scrolls sideways rather than wrapping onto three lines when an
        // academy runs many circle types.
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm
                          font-medium transition-colors ${
                            selected
                              ? "border-brand-600 bg-brand-600 text-white"
                              : "border-border bg-surface text-foreground hover:border-brand-400"
                          }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  selected
                    ? "bg-white/20 text-white"
                    : "bg-surface-subtle text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {children.map((panel, index) => (
        <div
          key={tabs[index]?.id ?? index}
          role="tabpanel"
          id={`${baseId}-panel-${index}`}
          aria-labelledby={`${baseId}-tab-${index}`}
          className={index === active ? "" : "hidden"}
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
