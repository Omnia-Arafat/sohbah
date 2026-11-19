import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LoadedBoard } from "@/lib/schedule-boards";
import { arNum } from "@/lib/schedule-format";

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

/** The leaf the track schedules mark things with, from the Sohbah logo. */
const LEAF = "rounded-[3px_50%_3px_50%]";

/**
 * One circle timetable (a schedule board), drawn in the same language as the
 * weekly track schedules: a leaf-marked header, one rounded row per day and
 * lime chips for the circles. Today's row is the one filled in, the way the
 * current week is on «جداول المسارات».
 */
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
  const total = days.reduce((sum, day) => sum + day.entries.length, 0);

  /*
    The type is named only when it says something the title does not: a board
    simply titled after its own type (what the one-tap "create a board for
    this type" button produces) would print the same words twice.
  */
  const eyebrow = [
    title.trim() !== typeLabel.trim() ? typeLabel : null,
    board.gender_category ? tDashboard(`gender.${board.gender_category}`) : null,
  ].filter(Boolean);

  return (
    <section
      id={`board-${board.id}`}
      className="motion-board card flex scroll-mt-4 flex-col gap-4"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <header className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className={`h-6 w-5 flex-none bg-brand-500 ${LEAF}`} />
        <div className="flex min-w-40 flex-1 flex-col">
          {eyebrow.length > 0 && (
            <span className="text-xs font-bold text-muted-foreground">{eyebrow.join(" · ")}</span>
          )}
          <h2 className="text-xl font-black sm:text-2xl">{title}</h2>
        </div>
        <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-extrabold text-brand-700 dark:bg-brand-900 dark:text-lime-200">
          {t("circlesCount", { count: locale === "ar" ? arNum(total) : total })}
        </span>
      </header>

      {note && <p className="text-sm font-semibold text-muted-foreground">{note}</p>}

      {days.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-lime-200 px-5 py-8 text-center font-bold text-muted-foreground dark:border-brand-800">
          {t("boardEmpty")}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {days.map(({ day, entries }) => {
            const isToday = day === todayIndex;
            return (
              <li
                key={day}
                aria-current={isToday ? "date" : undefined}
                className={`flex flex-col gap-2.5 rounded-2xl px-3 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                  isToday
                    ? "border-2 border-brand-500 bg-lime-100 dark:bg-brand-900"
                    : "border border-lime-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/40"
                }`}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-36">
                  <span
                    aria-hidden="true"
                    className={`size-4 flex-none ${LEAF} ${isToday ? "bg-brand-600" : "bg-lime-400"}`}
                  />
                  <span className="text-base font-black">{t(`days.${day}`)}</span>
                  {isToday && (
                    <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                      {t("today")}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-wrap gap-2">
                  {entries.map((entry) => (
                    <Link
                      key={entry.circleId}
                      href={`/${academySlug}/circle/${entry.registrationSlug}`}
                      className="group inline-flex min-h-11 items-center gap-2 rounded-xl border-[1.5px]
                                 border-lime-200 bg-surface px-2.5 py-1.5 text-sm transition-all
                                 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-sm
                                 focus-visible:outline-2 focus-visible:outline-offset-2
                                 focus-visible:outline-brand-600 dark:border-brand-800"
                      title={entry.circleName}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-7 flex-none items-center justify-center bg-lime-300 text-xs font-black text-brand-900 ${LEAF}`}
                      >
                        {entry.teacherName.trim().charAt(0)}
                      </span>
                      <span className="font-bold group-hover:text-brand-700 dark:group-hover:text-lime-200">
                        {entry.teacherName}
                      </span>
                      <span className="flex items-center gap-1 font-display text-sm font-bold text-brand-700 dark:text-lime-200">
                        <Clock className="size-3.5" aria-hidden="true" />
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
