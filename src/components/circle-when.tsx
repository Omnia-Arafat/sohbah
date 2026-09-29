import { CalendarDays, Clock } from "lucide-react";

export function CircleWhen({
  typeLabel,
  days,
  time,
  locale,
  tone = "brand",
  size = "md",
  titleAs: Title = "p",
}: {
  typeLabel: string;
  days: string[];
  time: string;
  locale: string;
  tone?: "brand" | "accent";
  size?: "lg" | "md";
  titleAs?: "p" | "h1";
}) {
  const chip =
    tone === "accent"
      ? "bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-300"
      : "bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-100";

  return (
    <div className="min-w-0">
      <Title
        className={`truncate font-display font-bold ${
          size === "lg" ? "text-2xl sm:text-3xl" : "text-lg"
        }`}
      >
        {typeLabel}
      </Title>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {days.length > 0 && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}
          >
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {days.join(locale === "ar" ? "، " : ", ")}
          </span>
        )}
        {time && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}
          >
            <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {time}
          </span>
        )}
      </div>
    </div>
  );
}
