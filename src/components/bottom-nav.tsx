"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  House,
  LayoutGrid,
  Plus,
  Route,
  Tags,
  Trophy,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The app's primary navigation on a phone, which is how essentially everyone
 * here uses it: four destinations and the one action worth a thumb, pinned to
 * the bottom of every academy page.
 *
 * Everything that does not deserve a permanent tab lives behind "المزيد" as a
 * sheet, which is what keeps /admin from growing back into a wall of cards.
 * Nothing here replaces an existing route — every tab points at a page that
 * already existed, so the old links keep working exactly as they did.
 */
export function BottomNav({
  academySlug,
  isAdmin,
  canSupervise,
}: {
  academySlug: string;
  isAdmin: boolean;
  /** Supervisors and admins get the reports tab in place of the schedule
   *  tab — the schedule is still one tap away in "المزيد" for them. */
  canSupervise: boolean;
}) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }

    /*
      Freeze the page underneath while the sheet is up.

      The sheet has always been scrollable, but nothing stopped the page
      behind it, so a drag that ran past the end of the sheet carried on into
      the page — which then slid around under the dimmed backdrop. That is
      what made scrolling in here feel broken, and it matters more now that
      the grid inside scrolls by design.

      The previous value is restored rather than cleared, so this cannot
      clobber an `overflow` some other screen had set.
    */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  const home = `/${academySlug}/dashboard`;
  const schedule = `/${academySlug}/schedule`;
  const reports = `/${academySlug}/admin/reports`;
  const circles = `/${academySlug}/admin/circles`;

  const isHome = pathname === home;
  const isSchedule = pathname.startsWith(schedule);
  const isReports = pathname.startsWith(reports);
  const isCircles = pathname.startsWith(circles);

  /*
    Sections that live in the sheet rather than on a tab of their own.

    ORDER IS THE DESIGN. The sheet shows two rows of four and scrolls for the
    rest, so the first eight entries here are what a reader sees without
    moving her thumb — the daily ones — and the tail is what gets set up once
    and then forgotten: which boards the timetable draws, what kinds of حلقة
    exist.

    The group headings this list used to carry are gone. They cost 84px of a
    sheet whose whole problem was height, and an icon over a word is
    recognised by shape, which is the work a heading was doing.
  */
  const sheetLinks = [
    { href: `/${academySlug}/admin/students`, label: t("students"), Icon: GraduationCap, adminOnly: false, hidden: false },
    { href: `/${academySlug}/admin/teachers`, label: t("teachers"), Icon: UserCheck, adminOnly: false, hidden: false },
    // A plain teacher already has this as her primary second tab; a
    // supervisor/admin has "التقارير" there instead, so it only needs a
    // place in the sheet for her.
    { href: schedule, label: t("schedule"), Icon: CalendarDays, adminOnly: false, hidden: !canSupervise },
    // A مسار does not get a tab of its own: the five slots below are the five
    // things every role does daily, and a tab for something only a مشرفة
    // touches would push one of them off. Same rule that keeps this sheet
    // from growing back into /admin's old wall of cards.
    // تحدي الجمعة's board. Supervisors only, and in the first row of the
    // sheet because it is read every Friday.
    { href: `/${academySlug}/admin/challenges`, label: t("challenges"), Icon: Trophy, adminOnly: false, hidden: !canSupervise },
    { href: `/${academySlug}/admin/tracks`, label: t("tracks"), Icon: Route, adminOnly: true, hidden: false },
    // Open to every معلمة rather than admin-only: she is the one who prepares
    // the lesson she is about to teach.
    { href: `/${academySlug}/admin/curricula`, label: t("curricula"), Icon: BookOpen, adminOnly: false, hidden: false },
    // Also open to every معلمة: she writes the quiz on what she taught.
    { href: `/${academySlug}/admin/quizzes`, label: t("quizzes"), Icon: ClipboardList, adminOnly: false, hidden: false },
    { href: `/${academySlug}/admin/progress`, label: t("progress"), Icon: TrendingUp, adminOnly: false, hidden: false },
    // The mirror image of the schedule above: already a primary tab for a
    // supervisor, so listing it again here would just be clutter.
    { href: reports, label: t("reports"), Icon: BarChart, adminOnly: false, hidden: canSupervise },
    // Not a menu of links but a board of alerts and summaries, and it is NOT
    // a tab — so the sheet is its only way in from a phone.
    { href: `/${academySlug}/admin`, label: t("adminHome"), Icon: LayoutGrid, adminOnly: false, hidden: false },

    // ---- from here down is below the fold: set once, then forgotten ----

    // Boards decide what the public timetable shows, so a مشرفة needs it:
    // she is the one who notices circles missing from the schedule.
    { href: `/${academySlug}/admin/schedules`, label: t("schedules"), Icon: CalendarDays, adminOnly: false, hidden: !canSupervise },
    { href: `/${academySlug}/admin/circle-types`, label: t("circleTypes"), Icon: Tags, adminOnly: true, hidden: false },
  ].filter((link) => (!link.adminOnly || isAdmin) && !link.hidden);

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-brand-950/40"
          />

          <div className="motion-sheet absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-6 shadow-lg">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-subtle" />

            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">{t("allSections")}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("adminArea")}</p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label={t("close")}
                className="rounded-lg border border-border-subtle p-1.5 text-muted-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/*
              The cap is on the GRID, not on the sheet. That is the whole
              point: what grows when a section ships is the scrollable length
              inside it, so the sheet itself stays the height it is today, for
              good.

              166px is two rows of 72 plus their 6px gap, and then 16 more so
              the third row's tiles are visibly CUT. A grid cropped exactly at
              a row boundary looks finished, and nobody drags something that
              looks finished.

              overscroll-contain keeps the drag in here: without it, reaching
              the end of this list hands the gesture to the page underneath.
            */}
            <div className="relative">
              <div className="max-h-[166px] overflow-y-auto overscroll-contain">
                <div className="grid grid-cols-4 gap-1.5">
                  {sheetLinks.map(({ href, label, Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      // Closed here rather than on a route change: a tap that
                      // navigates should leave the sheet behind it, and doing
                      // it in the handler keeps it out of an effect.
                      onClick={() => setSheetOpen(false)}
                      className="flex min-h-[72px] flex-col items-center gap-1.5 rounded-xl bg-surface-muted
                                 px-1 py-2.5 transition-colors hover:bg-brand-50 dark:hover:bg-brand-900"
                    >
                      <Icon
                        className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300"
                        aria-hidden="true"
                      />
                      <span className="text-center text-[11px] font-semibold leading-tight">
                        {label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Only drawn when something is actually cut off. */}
              {sheetLinks.length > 8 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phones only: on a wider screen the existing header and /admin cards
          already do this job, and a bar pinned to the bottom of a desktop
          window would just be in the way. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(14,31,25,0.05)] sm:hidden print:hidden">
        <div className="mx-auto flex max-w-4xl items-start justify-around pt-2">
          <NavTab href={home} label={t("home")} active={isHome} Icon={House} />
          {canSupervise ? (
            <NavTab href={reports} label={t("reports")} active={isReports} Icon={BarChart} />
          ) : (
            <NavTab href={schedule} label={t("schedule")} active={isSchedule} Icon={CalendarDays} />
          )}

          {/* The one creative act in the app, given its own affordance. */}
          <Link
            href={`/${academySlug}/dashboard/new`}
            className="flex w-[68px] flex-col items-center gap-1"
          >
            <span className="-mt-5 flex h-13 w-13 items-center justify-center rounded-full border-[3px] border-surface bg-brand-600 shadow-[0_6px_14px_rgba(30,110,81,0.32)]">
              <Plus className="h-6 w-6 text-white" strokeWidth={2.4} aria-hidden="true" />
            </span>
            <span className="-mt-0.5 text-[10.5px] font-bold text-brand-700 dark:text-brand-300">
              {t("newCircle")}
            </span>
          </Link>

          <NavTab href={circles} label={t("circles")} active={isCircles} Icon={Users} />

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            className="relative flex w-[68px] flex-col items-center gap-1 pb-2 pt-1.5"
          >
            {sheetOpen && (
              <span className="absolute top-0 h-[3px] w-5 rounded-full bg-brand-600" />
            )}
            <LayoutGrid
              className={`h-[23px] w-[23px] ${sheetOpen ? "text-brand-600 dark:text-brand-300" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <span
              className={`text-[10.5px] ${
                sheetOpen
                  ? "font-bold text-brand-600 dark:text-brand-300"
                  : "font-semibold text-muted-foreground"
              }`}
            >
              {t("more")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

/** The active mark is a short bar above the icon, not a filled pill. */
function NavTab({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: typeof House;
}) {
  return (
    <Link href={href} className="relative flex w-[68px] flex-col items-center gap-1 pb-2 pt-1.5">
      {active && <span className="absolute top-0 h-[3px] w-5 rounded-full bg-brand-600" />}
      <Icon
        className={`h-[23px] w-[23px] ${active ? "text-brand-600 dark:text-brand-300" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <span
        className={`text-[10.5px] ${
          active
            ? "font-bold text-brand-600 dark:text-brand-300"
            : "font-semibold text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
