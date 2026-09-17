"use client";

import {
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  ClipboardCheck,
  House,
  Sunrise,
  TabletSmartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";

/**
 * The student's navigation on a screen wide enough not to have the bottom bar.
 *
 * `<PublicNav>` is `sm:hidden` — it was built for a phone, which is how nearly
 * every student arrives. On a laptop it disappears, and what was left in the
 * header was a link to the schedule and a link for staff to sign in: a student
 * reading her own page had no way to the mushaf, to الأذكار, to اختبري حفظك or
 * to الاختبارات at all, on any screen. Reported by a supervisor who opened
 * صفحتي on a desktop and found it a dead end.
 *
 * Same destinations as the phone bar, in the same order, so the two are one
 * design rather than two. There is no «المزيد» here because the row has the
 * width for all of it — the sheet on a phone exists for the five slots it has,
 * not because these belong one level down.
 */
export function PublicNavDesktop({ academySlug }: { academySlug: string }) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  const links = [
    { href: `/${academySlug}`, label: t("home"), Icon: House, exact: true },
    { href: `/${academySlug}/schedule`, label: t("schedule"), Icon: CalendarDays },
    { href: `/${academySlug}/self-test`, label: t("selfTest"), Icon: CircleCheckBig },
    { href: `/${academySlug}/mushaf`, label: t("mushaf"), Icon: BookOpen },
    { href: `/${academySlug}/adhkar`, label: t("adhkar"), Icon: Sunrise },
    { href: `/${academySlug}/quizzes`, label: t("quizzes"), Icon: ClipboardCheck },
    { href: `/${academySlug}/me`, label: t("myPage"), Icon: CircleCheckBig },
    { href: `/${academySlug}/install`, label: t("install"), Icon: TabletSmartphone },
  ];

  return (
    <nav
      aria-label={t("allSections")}
      className="hidden border-b border-border-subtle bg-surface sm:block print:hidden"
    >
      {/* Scrolls rather than wraps: a second row of links under the header
          would push the page itself below the fold on a short window. */}
      <div className="mx-auto w-full max-w-4xl overflow-x-auto px-4">
        <ul className="flex items-center gap-1 py-1.5">
          {links.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl
                              px-2.5 py-1.5 text-sm transition-colors ${
                                active
                                  ? "font-bold text-brand-700 dark:text-brand-300"
                                  : "font-medium text-muted-foreground hover:text-brand-700 dark:hover:text-brand-300"
                              }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
