"use client";

import {
  BarChart,
  CalendarDays,
  GraduationCap,
  House,
  LayoutGrid,
  LogOut,
  Plus,
  Tags,
  UserCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/brand-mark";
import { Link, usePathname } from "@/i18n/navigation";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof House;
  /** Matched as a prefix so a detail page keeps its section highlighted. */
  prefix?: boolean;
  adminOnly?: boolean;
};

/**
 * The desktop counterpart of <BottomNav>: same destinations, same order, same
 * rule about which of them an admin alone may see — a rail instead of a bar,
 * because a strip pinned to the bottom of a desktop window is just in the way.
 *
 * Only one of the two is ever on screen: this is hidden below `sm`, the bar is
 * hidden from `sm` up.
 */
export function SideNav({
  academySlug,
  academyName,
  academyColor,
  logoPath,
  isAdmin,
  teacherName,
  roleLabel,
  signOutAction,
}: {
  academySlug: string;
  academyName: string;
  academyColor: string;
  logoPath: string | null;
  isAdmin: boolean;
  teacherName: string;
  roleLabel: string;
  signOutAction: () => void;
}) {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  const teaching: NavItem[] = [
    { href: `/${academySlug}/dashboard`, label: t("home"), Icon: House },
    { href: `/${academySlug}/schedule`, label: t("schedule"), Icon: CalendarDays, prefix: true },
  ];

  const supervision: NavItem[] = [
    { href: `/${academySlug}/admin/circles`, label: t("circles"), Icon: Users, prefix: true },
    { href: `/${academySlug}/admin/students`, label: t("students"), Icon: GraduationCap, prefix: true },
    { href: `/${academySlug}/admin/teachers`, label: t("teachers"), Icon: UserCheck, prefix: true },
    { href: `/${academySlug}/admin/reports`, label: t("reports"), Icon: BarChart, prefix: true },
    { href: `/${academySlug}/admin/circle-types`, label: t("circleTypes"), Icon: Tags, prefix: true, adminOnly: true },
    { href: `/${academySlug}/admin/schedules`, label: t("schedules"), Icon: CalendarDays, prefix: true, adminOnly: true },
    { href: `/${academySlug}/admin`, label: t("adminHome"), Icon: LayoutGrid },
  ].filter((item) => !item.adminOnly || isAdmin);

  function isActive(item: NavItem) {
    return item.prefix ? pathname.startsWith(item.href) : pathname === item.href;
  }

  function Row({ item }: { item: NavItem }) {
    const active = isActive(item);
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
          active
            ? "border-s-[3px] border-s-brand-600 bg-brand-50 font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-100"
            : "border-s-[3px] border-s-transparent font-medium text-foreground hover:bg-surface-muted"
        }`}
      >
        <item.Icon
          className={`h-[19px] w-[19px] shrink-0 ${
            active ? "text-brand-600 dark:text-brand-300" : "text-muted-foreground"
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-63 flex-col border-e border-border-subtle bg-surface sm:flex">
      <Link
        href={`/${academySlug}`}
        className="flex min-w-0 items-center gap-3 border-b border-border-subtle px-4 py-4"
      >
        {logoPath ? (
          <div className="relative h-8 w-8 shrink-0">
            <Image src={logoPath} alt={academyName} fill className="object-contain" />
          </div>
        ) : (
          <BrandMark className="h-8 w-8 shrink-0" />
        )}
        <span
          className="min-w-0 truncate font-display text-base font-bold dark:text-brand-300"
          style={{ color: academyColor }}
        >
          {academyName}
        </span>
      </Link>

      <div className="px-3 py-3">
        <Link
          href={`/${academySlug}/dashboard/new`}
          className="btn-primary w-full px-4 py-2.5 text-sm"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
          {t("newCircle")}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-bold text-muted-foreground">
          {t("groupTeaching")}
        </p>
        {teaching.map((item) => (
          <Row key={item.href} item={item} />
        ))}

        <p className="px-3 pb-1.5 pt-4 text-[11px] font-bold text-muted-foreground">
          {t("groupSupervision")}
        </p>
        {supervision.map((item) => (
          <Row key={item.href} item={item} />
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{teacherName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            title={t("signOut")}
            aria-label={t("signOut")}
            className="flex items-center rounded-lg border border-border-subtle p-2 text-muted-foreground
                       transition-colors hover:border-absent hover:text-absent"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </aside>
  );
}
