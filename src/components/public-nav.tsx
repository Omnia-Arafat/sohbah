"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  Ellipsis,
  House,
  Smartphone,
  Sunrise,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The bottom bar for everyone who is not signed in — which, in this academy,
 * is every student.
 *
 * A معلمة has had `<BottomNav>` since the dashboard was built; a student had
 * nothing. She arrived on a circle link, and the only way back to anything was
 * the browser's own back button. Now the three things that exist for her are
 * always one thumb away.
 *
 * FIVE SLOTS, as the canvas draws them: الرئيسية · الجدول · اختبري حفظك ·
 * المصحف · صفحتي, with the centre one raised.
 *
 * WHY اختبري حفظك GETS THE RAISED SLOT and not "ادخلي الحلقة": joining a live
 * circle is the loudest thing a student does, but it is already the loudest
 * thing on the home screen — a gold-bordered card with a full-width button —
 * and it is only meaningful for the few hours a day a circle is running. A
 * centre action that is dead most of the day teaches people to ignore it.
 * اختبري حفظك is available every hour, from any screen, and it is the single
 * highest-value thing she can do for her حفظ.
 *
 * The fifth slot is الاختبارات, as drawn. It gathers what her معلمة set across
 * every circle she attends — before that screen existed, quizzes lived only on
 * a circle's page and a student in three circles had to open three links to
 * find out whether anything was set.
 *
 * صفحتي loses its tab to it and keeps a full-width card on the home screen,
 * plus a link in this screen's own header. That follows the canvas, and it is
 * also the right order: a quiz has a closing time and her record does not.
 *
 * THE FIFTH SLOT IS «المزيد», not الاختبارات. The bar filled up: أذكار الصباح
 * والمساء arrived and wanted a place, and six fixed 68px tabs is 408px on a
 * 375px phone. Making them share the width instead was tried and thrown away —
 * it cost every label its room and cut «اختبري حفظك» in half, which is a worse
 * bar for everyone in exchange for one more icon.
 *
 * So the fifth tab opens the same sheet a معلمة already has, and الاختبارات,
 * الأذكار, صفحتي and التسجيل live inside it. That demotes الاختبارات
 * by one tap, which is the honest price: of the things in the sheet it is the
 * only one most students will not open on most days, and المصحف and الأذكار
 * both keep a tile on the home screen besides.
 *
 * Every value here is copied from `bottom-nav.tsx` rather than re-invented —
 * 68px tabs, a 23px icon, a 10.5px label, the same 3×20px mark above the
 * active one, and now the same sheet — so a معلمة who is also a student sees
 * one bar, not two designs.
 */
export function PublicNav({ academySlug }: { academySlug: string }) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const home = `/${academySlug}`;
  const schedule = `/${academySlug}/schedule`;
  const selfTest = `/${academySlug}/self-test`;
  const mushaf = `/${academySlug}/mushaf`;
  const quizzes = `/${academySlug}/quizzes`;

  /** What the fifth tab holds, in the order a student reaches for them. */
  const sheetLinks = [
    { href: mushaf, label: t("mushaf"), Icon: BookOpen },
    { href: `/${academySlug}/adhkar`, label: t("adhkar"), Icon: Sunrise },
    { href: `/${academySlug}/me`, label: t("myPage"), Icon: CircleCheckBig },
    { href: `/${academySlug}/register`, label: t("register"), Icon: UserPlus },
    // /install is here as well as being a link to send. The page already knows
    // when it is being read from an installed app and says so instead of
    // offering to install again, so it costs nothing to leave in the sheet for
    // the students who never receive the message.
    { href: `/${academySlug}/install`, label: t("install"), Icon: Smartphone },
  ];

  const onASheetPage = sheetLinks.some((link) => pathname.startsWith(link.href));

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
            <h2 className="font-display text-lg font-bold">{t("allSections")}</h2>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label={t("close")}
              className="rounded-lg border border-border-subtle p-1.5 text-muted-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {sheetLinks.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                // Closed here rather than on a route change: a tap that
                // navigates should leave the sheet behind it, and doing it in
                // the handler keeps it out of an effect.
                onClick={() => setSheetOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl border border-border-subtle
                           bg-surface p-3 transition-colors hover:border-brand-600"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900">
                  <Icon
                    className="h-[18px] w-[18px] text-brand-600 dark:text-brand-300"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 text-sm font-semibold leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )}

    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface
                 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(14,31,25,0.05)]
                 sm:hidden print:hidden"
    >
      <div className="mx-auto flex max-w-4xl items-start justify-around pt-2">
        <PublicTab
          href={home}
          label={t("home")}
          // Exact match only: every page in the academy starts with this path,
          // so `startsWith` would light "الرئيسية" on every screen.
          active={pathname === home}
          Icon={House}
        />
        <PublicTab
          href={schedule}
          label={t("schedule")}
          active={pathname.startsWith(schedule)}
          Icon={CalendarDays}
        />
        {/*
          The raised centre action. Every value is bottom-nav.tsx's «+ حلقة
          جديدة» slot, to the pixel: a 52px circle lifted 20px, a 3px ring in
          the surface colour, the same brand shadow, a 24px icon at stroke 2.4
          and a 10.5px bold label pulled up 2px.
        */}
        <Link
          href={selfTest}
          className="flex w-[68px] flex-col items-center gap-1"
        >
          <span className="-mt-5 flex h-13 w-13 items-center justify-center rounded-full border-[3px] border-surface bg-brand-600 shadow-[0_6px_14px_rgba(30,110,81,0.32)]">
            <CircleCheckBig
              className="h-6 w-6 text-white"
              strokeWidth={2.4}
              aria-hidden="true"
            />
          </span>
          <span className="-mt-0.5 text-[10.5px] font-bold text-brand-700 dark:text-brand-300">
            {t("selfTest")}
          </span>
        </Link>

        {/*
          الاختبارات has the fourth tab, not المصحف. Both are things she opens
          without being sent anywhere, so neither is obviously the tab — but
          المصحف has a tile of its own on the home screen that remembers her
          page, and a quiz has a closing time. The one with a deadline gets the
          permanent slot; the one she can always find gets the sheet.
        */}
        <PublicTab
          href={quizzes}
          label={t("quizzes")}
          active={pathname.startsWith(quizzes)}
          Icon={ClipboardCheck}
        />
        {/* Same 68px slot as a tab, so the row keeps its rhythm — it just
            opens a sheet instead of going somewhere. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          className="relative flex w-[68px] flex-col items-center gap-1 pb-2 pt-1.5"
        >
          {(onASheetPage || sheetOpen) && (
            <span className="absolute top-0 h-[3px] w-5 rounded-full bg-brand-600" />
          )}
          <Ellipsis
            className={`h-[23px] w-[23px] ${
              onASheetPage || sheetOpen
                ? "text-brand-600 dark:text-brand-300"
                : "text-muted-foreground"
            }`}
            aria-hidden="true"
          />
          <span
            className={`text-[10.5px] ${
              onASheetPage || sheetOpen
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
function PublicTab({
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
    <Link
      href={href}
      className="relative flex w-[68px] flex-col items-center gap-1 pb-2 pt-1.5"
    >
      {active && (
        <span className="absolute top-0 h-[3px] w-5 rounded-full bg-brand-600" />
      )}
      <Icon
        className={`h-[23px] w-[23px] ${
          active ? "text-brand-600 dark:text-brand-300" : "text-muted-foreground"
        }`}
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
