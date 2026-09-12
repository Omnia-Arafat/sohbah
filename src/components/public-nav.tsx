"use client";

import { CalendarDays, House, UserRound } from "lucide-react";
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
 * THREE TABS, NOT FIVE. The design has الرئيسية · الجدول · اختبري حفظك ·
 * المصحف · الاختبارات, and that is the right destination. But the mushaf and
 * the self-tests are not built yet, and a tab that opens nothing is worse than
 * an absent tab: it teaches people that the bar is decoration. The two slots
 * are held open in the design and land with the screens they lead to.
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
