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
  LogOut,
  Plus,
  Route,
  Tags,
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
  teacherName,
  roleLabel,
  signOutAction,
}: {
  academySlug: string;
  isAdmin: boolean;
  /** Supervisors and admins get the reports tab in place of the schedule
   *  tab — the schedule is still one tap away in "المزيد" for them. */
  canSupervise: boolean;
  teacherName: string;
  roleLabel: string;
  /** Bound to this academy by the layout; posted from the sheet. */
  signOutAction: () => void;
}) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
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

    `group` is the only thing new here. The sheet had grown to a dozen
    identical tiles in one undifferentiated grid — every feature added one
    more, and finding "المناهج" meant reading all twelve. Four small headings
    let the eye jump to a group and then to a tile, and cost no extra tap,
    which an accordion would. Nothing was renamed, moved out or removed.
  */
  const sheetLinks = [
    // A plain teacher already has this as her primary second tab; a
    // supervisor/admin has "التقارير" there instead, so it only needs a
    // place in the sheet for her.
    { href: schedule, label: t("schedule"), Icon: CalendarDays, group: "circles" as const, adminOnly: false, hidden: !canSupervise },
    { href: `/${academySlug}/admin/students`, label: t("students"), Icon: GraduationCap, group: "people" as const, adminOnly: false, hidden: false },
    // A مسار does not get a tab of its own: the five slots below are the five
    // things every role does daily, and a tab for something only a مشرفة
    // touches would push one of them off. Same rule that keeps this sheet
    // from growing back into /admin's old wall of cards.
    { href: `/${academySlug}/admin/tracks`, label: t("tracks"), Icon: Route, group: "teaching" as const, adminOnly: true, hidden: false },
    // Open to every معلمة rather than admin-only: she is the one who prepares
    // the lesson she is about to teach.
    { href: `/${academySlug}/admin/curricula`, label: t("curricula"), Icon: BookOpen, group: "teaching" as const, adminOnly: false, hidden: false },
    // Also open to every معلمة: she writes the quiz on what she taught.
    { href: `/${academySlug}/admin/quizzes`, label: t("quizzes"), Icon: ClipboardList, group: "teaching" as const, adminOnly: false, hidden: false },
    { href: `/${academySlug}/admin/teachers`, label: t("teachers"), Icon: UserCheck, group: "people" as const, adminOnly: false, hidden: false },
    // The mirror image: already a primary tab for her, so listing it again
    // here would just be clutter.
    { href: reports, label: t("reports"), Icon: BarChart, group: "teaching" as const, adminOnly: false, hidden: canSupervise },
    { href: `/${academySlug}/admin/progress`, label: t("progress"), Icon: TrendingUp, group: "teaching" as const, adminOnly: false, hidden: false },
    { href: `/${academySlug}/admin/circle-types`, label: t("circleTypes"), Icon: Tags, group: "circles" as const, adminOnly: true, hidden: false },
    // Boards decide what the public timetable shows, so a مشرفة needs it:
    // she is the one who notices circles missing from the schedule.
    { href: `/${academySlug}/admin/schedules`, label: t("schedules"), Icon: CalendarDays, group: "circles" as const, adminOnly: false, hidden: !canSupervise },
    { href: `/${academySlug}/admin`, label: t("adminHome"), Icon: LayoutGrid, group: "circles" as const, adminOnly: false, hidden: false },
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

            {(
              [
                // Deliberately NOT groupTeaching/groupSupervision: those two
                // are the desktop rail's own headings, and reusing a key here
                // renamed a heading over there.
                ["circles", t("sheetCircles")],
                ["people", t("sheetPeople")],
                ["teaching", t("sheetTeaching")],
              ] as const
            ).map(([group, heading]) => {
              const items = sheetLinks.filter((link) => link.group === group);
              if (items.length === 0) return null;
              return (
                <section key={group}>
                  <h3 className="px-0.5 pb-1.5 pt-3 text-[11px] font-bold text-muted-foreground">
                    {heading}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map(({ href, label, Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        // Closed here rather than on a route change: a tap that
                        // navigates should leave the sheet behind it, and doing
                        // it in the handler keeps it out of an effect.
                        onClick={() => setSheetOpen(false)}
                        className="flex min-h-11 items-center gap-2.5 rounded-xl bg-surface-muted px-3
                                   py-2.5 transition-colors hover:bg-brand-50 dark:hover:bg-brand-900"
                      >
                        <Icon
                          className="h-[18px] w-[18px] shrink-0 text-brand-600 dark:text-brand-300"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 truncate text-sm font-semibold leading-tight">
                          {label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{teacherName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <form action={signOutAction}>
                <button type="submit" className="btn-danger inline-flex items-center gap-1.5">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  {t("signOut")}
                </button>
              </form>
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
