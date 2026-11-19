import Image from "next/image";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LoadedBoard } from "@/lib/schedule-boards";
import { DAY_LEAF, arNum } from "@/lib/schedule-format";

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

const LEAF = "M7 1C12 5 12 13 7 17C2 13 2 5 7 1Z";
/** Friday in the board's 0 = Sunday numbering: the sand row, as on the sheet. */
const FRIDAY = 5;

/**
 * One circle timetable (a schedule board) in the layout chosen on the design
 * canvas for the weekly schedules, «هـ — غصن في إطار» (see schedule-sheet.tsx):
 * a double green frame, the title underlined in lime, the green «اليوم» band,
 * a vine down the side with a leaf for each day, maroon day names in their
 * own column, rows alternating pale lime and white, and Friday in sand.
 *
 * Unlike the sheet it is not an A4 page: it grows with the board's days and
 * reads at phone width without a box to scroll. Today's row takes the
 * maroon of the sheet's meeting row, so it stands out the same way.
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
  const showType = title.trim() !== typeLabel.trim();
  const gender = board.gender_category ? tDashboard(`gender.${board.gender_category}`) : null;

  return (
    <section
      id={`board-${board.id}`}
      className="motion-board scroll-mt-4 rounded-[22px] border-[3px] border-[#2f7d32] bg-white p-1.5 text-[#1f2a1c]"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border-[1.5px] border-[#9bc93b] px-3 pb-4 pt-5 sm:px-6">
        {/* The leaf sprig in the frame's corner. */}
        <svg aria-hidden="true" viewBox="0 0 70 70" className="pointer-events-none absolute -top-1 end-[-4px] size-12 sm:size-16">
          <g transform="translate(22 30) rotate(-40)"><path d="M0 -20C9 -13 9 4 0 12C-9 4 -9 -13 0 -20Z" fill="#9bc93b" /></g>
          <g transform="translate(36 18) rotate(-75)"><path d="M0 -15C7 -10 7 3 0 9C-7 3 -7 -10 0 -15Z" fill="#4ca03a" /></g>
        </svg>

        <header className="flex items-center gap-3 sm:gap-4">
          {academySlug === "sohbah" && (
            <Image
              src="/assets/logos/sohbah-logo.webp"
              alt=""
              width={160}
              height={160}
              className="size-14 flex-none object-contain sm:size-20"
            />
          )}
          <div className="flex flex-1 flex-col items-center gap-1 text-center">
            <h2 className="text-xl font-black leading-snug text-[#2f7d32] underline decoration-[#c9e27a] decoration-4 underline-offset-8 sm:text-2xl">
              {title}
            </h2>
            {(showType || gender) && (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-sm font-black">
                {showType && <span className="text-[#7a1e3a]">{typeLabel}</span>}
                {showType && gender && (
                  <svg aria-hidden="true" viewBox="0 0 14 18" className="h-3 w-2.5">
                    <path d={LEAF} fill="#9bc93b" />
                  </svg>
                )}
                {gender && <span className="text-[#2f5e1e]">{gender}</span>}
              </div>
            )}
            <span className="text-base font-black">
              {t("circlesCount", { count: locale === "ar" ? arNum(total) : total })}
            </span>
          </div>
        </header>

        {note && <p className="text-center text-sm font-bold text-[#55624f]">{note}</p>}

        <div className="ms-11 flex overflow-hidden rounded-[14px] border-2 border-[#2f7d32] sm:ms-14">
          <span className="w-20 flex-none bg-[#2f7d32] px-2 py-2 text-center text-base font-black text-white sm:w-36 sm:text-lg">
            {t("dayColumn")}
          </span>
          <span className="flex-1 bg-[#4ca03a] px-2 py-2 text-center text-base font-black text-white sm:text-lg">
            {t("circlesTimetable")}
          </span>
        </div>

        {days.length === 0 ? (
          <div className="ms-11 rounded-2xl border-2 border-dashed border-[#c9e3a3] px-5 py-8 text-center font-extrabold text-[#55624f] sm:ms-14">
            {t("boardEmpty")}
          </div>
        ) : (
          <ul className="relative flex flex-col gap-2.5 ps-11 sm:ps-14">
            {/* The vine the day leaves hang from. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 36 700"
              preserveAspectRatio="none"
              className="pointer-events-none absolute start-1 top-[-14px] h-[calc(100%+14px)] w-7 sm:w-9"
            >
              <path
                d="M18 0 C30 80 6 160 18 240 C30 320 6 400 18 480 C30 560 6 630 18 700"
                fill="none"
                stroke="#9bc93b"
                strokeWidth="4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {days.map(({ day, entries }, i) => {
              const isToday = day === todayIndex;
              const isFriday = day === FRIDAY && !isToday;
              const row = isToday
                ? "border-[#e7c3cf] bg-[#fdf6f8]"
                : isFriday
                  ? "border-[#e8d3b0] bg-[#fbf3e6]"
                  : `border-[#cfe3a0] ${i % 2 ? "bg-white" : "bg-[#f7fbee]"}`;
              const divider = isToday ? "border-[#e7c3cf]" : isFriday ? "border-[#e8d3b0]" : "border-[#cfe3a0]";
              const leafFill = isToday ? "#7a1e3a" : DAY_LEAF[i % DAY_LEAF.length];
              const leafText = isToday || i % DAY_LEAF.length >= 3 ? "#ffffff" : "#1f2a1c";

              return (
                <li
                  key={day}
                  aria-current={isToday ? "date" : undefined}
                  className={`relative flex rounded-[14px] border-[1.5px] ${row}`}
                >
                  {isFriday ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 -mt-3 size-6 rounded-full border-[3px] border-[#c9a26b] bg-white start-[-38px] sm:start-[-46px]"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 -mt-[18px] flex h-9 w-8 items-center justify-center start-[-42px] sm:start-[-50px]"
                    >
                      <svg viewBox="0 0 14 18" className="absolute inset-0 size-full">
                        <path d={LEAF} fill={leafFill} />
                      </svg>
                      <span className="relative text-xs font-black" style={{ color: leafText }}>
                        {arNum(i + 1)}
                      </span>
                    </span>
                  )}

                  <div
                    className={`flex w-20 flex-none flex-col items-center justify-center gap-1 border-e-[1.5px] px-1 py-2 text-center sm:w-36 ${divider}`}
                  >
                    <span className="text-base font-black text-[#7a1e3a] sm:text-xl">{t(`days.${day}`)}</span>
                    {isToday && (
                      <span className="rounded-full bg-[#7a1e3a] px-2.5 py-0.5 text-xs font-extrabold text-white">
                        {t("today")}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-wrap items-center justify-center gap-2 p-2.5">
                    {entries.map((entry) => (
                      <Link
                        key={entry.circleId}
                        href={`/${academySlug}/circle/${entry.registrationSlug}`}
                        title={entry.circleName}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] border-[#cfe3a0]
                                   bg-white px-3 py-1.5 text-sm transition-colors hover:border-[#4ca03a]
                                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f7d32]"
                      >
                        <span className="font-extrabold">{entry.teacherName}</span>
                        <span className="flex items-center gap-1 font-display text-base font-bold text-[#2f7d32]">
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

        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-[#3d4a38]">
          <span>{t("footnote")}</span>
          {academySlug === "sohbah" && <span className="font-black text-[#7a1e3a]">صُحبة · So7bah</span>}
        </footer>
      </div>
    </section>
  );
}
