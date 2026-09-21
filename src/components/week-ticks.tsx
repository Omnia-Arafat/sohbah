/**
 * A track's weeks, one cell each.
 *
 * WHY NOT A PROGRESS BAR:
 *
 * Every track starts at 0 of 40, and a 0% bar is an empty grey line — six of
 * them down a page read as a screen that failed to load rather than as work
 * waiting to be done. Forty cells say the true thing: forty weeks, none
 * entered yet. Once they fill, the same row shows at a glance which track is
 * behind, which a number in the corner never does.
 *
 * `currentWeek` tints the single week a running cohort has reached, so one
 * element carries both "how much is entered" and "where we are".
 */
export function WeekTicks({
  total,
  filled,
  currentWeek = null,
  height = 14,
}: {
  total: number;
  /** Weeks whose schedule has been entered and published. */
  filled: number;
  /** 1-based; the week a cohort is living in right now. */
  currentWeek?: number | null;
  height?: number;
}) {
  const cells = Array.from({ length: total }, (_, i) => {
    if (currentWeek !== null && i === currentWeek - 1) return "now" as const;
    return i < filled ? ("done" as const) : ("empty" as const);
  });

  return (
    <span
      // One label for the whole strip: forty announced cells would be unusable.
      role="img"
      aria-label={`${filled} / ${total}`}
      className="flex gap-px"
    >
      {cells.map((kind, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ height }}
          className={`flex-grow rounded-[1px] ${
            kind === "now"
              ? "bg-accent-500"
              : kind === "done"
                ? "bg-brand-600"
                : "bg-surface ring-1 ring-inset ring-border-subtle"
          }`}
        />
      ))}
    </span>
  );
}
