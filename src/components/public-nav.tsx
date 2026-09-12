"use client";

import { BookOpen, CalendarDays, CircleCheckBig, House, UserRound } from "lucide-react";
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
 * The canvas's fifth slot is الاختبارات (her معلمة's quizzes). Those live on a
 * circle's own page today, and they only exist for a student who is in a
 * circle that has one — so صفحتي takes the slot until there is a screen that
 * gathers them.
 *
 * Every value here is copied from `bottom-nav.tsx` rather than re-invented —
 * 68px tabs, a 23px icon, a 10.5px label, and the same 3×20px mark above the
 * active one — so a معلمة who is also a student sees one bar, not two designs.
 */
export function PublicNav({ academySlug }: { academySlug: string }) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  const home = `/${academySlug}`;
  const schedule = `/${academySlug}/schedule`;
  const selfTest = `/${academySlug}/self-test`;
  const mushaf = `/${academySlug}/mushaf`;
  const me = `/${academySlug}/me`;

  return (
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

        <PublicTab
          href={mushaf}
          label={t("mushaf")}
          active={pathname.startsWith(mushaf)}
          Icon={BookOpen}
        />
        <PublicTab
          href={me}
          label={t("myPage")}
          active={pathname.startsWith(me)}
          Icon={UserRound}
        />
      </div>
    </nav>
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
