import { CalendarDays, Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LoadedBoard } from "@/lib/schedule-boards";

/**
 * Formats a stored HH:MM wall-clock time the way the reader's language writes
 * it — "5:00 م" in Arabic, "5:00 PM" in English — rather than the 24-hour
 * form the database keeps.
 */
function formatTime(startTime: string, locale: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export async function ScheduleBoardCard({
  loaded,
  academySlug,
  locale,
  typeLabel,
  index,
}: {
  loaded: LoadedBoard;
  academySlug: string;
  locale: string;
  typeLabel: string;
  /** Position on the page, used only to stagger the entrance animation. */
  index: number;
}) {
  const t = await getTranslations("schedule");
  const tDashboard = await getTranslations("dashboard");
  const { board, days, todayIndex } = loaded;

  const title = locale === "ar" ? board.title_ar : board.title_en;
  const note = locale === "ar" ? board.note_ar : board.note_en;

  return (
    <section
      className="motion-board card overflow-hidden p-0"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <header className="border-b border-border-subtle bg-brand-50 px-5 py-4 dark:bg-brand-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold text-brand-800 dark:text-brand-100 sm:text-xl">
            <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
            {title}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-100">
              {typeLabel}
            </span>
            {board.gender_category && (
              <span className="badge bg-surface text-muted-foreground">
                {tDashboard(`gender.${board.gender_category}`)}
              </span>
            )}
          </div>
        </div>
        {note && (
          <p className="mt-2 text-sm text-brand-700/90 dark:text-brand-200/90">
            {note}
          </p>
        )}
      </header>

      {days.length === 0 ? (
        <p className="px-5 py-6 text-center text-muted-foreground">
          {t("boardEmpty")}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {days.map(({ day, entries }) => {
            const isToday = day === todayIndex;
            return (
              <li
                key={day}
                className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                  // Gold is the app's "happening now" colour and nothing else;
                  // on a timetable that meaning maps exactly onto today's row.
                  isToday
                    ? "border-s-4 border-s-accent-400 bg-accent-100/50 dark:bg-accent-700/15"
                    : "border-s-4 border-s-transparent"
                }`}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-32">
                  <span
                    className={`font-display text-base font-bold ${
                      isToday ? "text-accent-700 dark:text-accent-300" : ""
                    }`}
                  >
                    {t(`days.${day}`)}
                  </span>
                  {isToday && (
                    <span className="badge-reciting shrink-0">{t("today")}</span>
                  )}
                </div>

                <div className="flex flex-1 flex-wrap gap-2">
                  {entries.map((entry) => (
                    <Link
                      key={entry.circleId}
                      href={`/${academySlug}/circle/${entry.registrationSlug}`}
                      className="group inline-flex items-center gap-2 rounded-xl border
                                 border-border-subtle bg-surface px-3 py-2 text-sm
                                 transition-all hover:-translate-y-0.5 hover:border-brand-500
                                 hover:shadow-sm focus-visible:outline-2
                                 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      title={entry.circleName}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                                   bg-brand-100 font-display text-sm font-bold text-brand-700
                                   dark:bg-brand-800 dark:text-brand-100"
                      >
                        {entry.teacherName.trim().charAt(0)}
                      </span>
                      <span className="font-medium group-hover:text-brand-700 dark:group-hover:text-brand-300">
                        {entry.teacherName}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatTime(entry.startTime, locale)}
                      </span>
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
