import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, LogIn } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { BottomNav } from "@/components/bottom-nav";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { SideNav } from "@/components/side-nav";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/app/[locale]/[academy]/login/actions";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getLocalizedAcademyName, getTeacherDisplayLabel } from "@/lib/academy-display";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";

type AcademyLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({
  params,
}: Omit<AcademyLayoutProps, "children">): Promise<Metadata> {
  const { locale, academy: academySlug } = await params;

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    return { title: "Academy Not Found" };
  }

  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);
  const description =
    locale === "ar"
      ? academy.description_ar || academyName
      : academy.description_en || academyName;

  return {
    title: { default: academyName, template: `%s · ${academyName}` },
    description: description,
    applicationName: academyName,
  };
}

export default async function AcademyLayout({
  children,
  params,
}: AcademyLayoutProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);
  const tNav = await getTranslations("nav");
  const tDashboard = await getTranslations("dashboard");

  // The bottom bar is for people who actually have somewhere to go: an
  // approved teacher or admin. A visitor keeps the header links exactly as
  // they were. `getTeacherSession` never redirects, so a signed-out visit
  // simply gets `null` here.
  const session = await getTeacherSession();
  const teacher = isActiveTeacher(session) ? session.teacher : null;

  const academyTagline =
    locale === "ar"
      ? academy.description_ar || ""
      : academy.description_en || "";

  return (
    <>
      {teacher && (
        <SideNav
          academySlug={academySlug}
          academyName={academyName}
          academyColor={academy.primary_color}
          logoPath={academy.logo_path}
          isAdmin={teacher.role === "admin"}
          teacherName={getTeacherDisplayLabel(teacher, academySlug, locale)}
          roleLabel={tDashboard(`role.${teacher.role}`)}
          signOutAction={signOut.bind(null, academySlug)}
        />
      )}

      {/* The rail is fixed, so the page is inset by its width from `sm` up
          rather than sharing a flex row with it — the header, content and
          footer keep the exact structure they had before it existed. */}
      <div className={`flex flex-1 flex-col ${teacher ? "sm:ps-63" : ""}`}>
        <header className="border-b border-border-subtle bg-surface">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
            {/* Hidden from `sm` up for a signed-in teacher: the side rail carries
                the same logo and name there, and two of them is one too many. */}
            <Link
              href={`/${academySlug}`}
              className={`flex min-w-0 items-center gap-3 ${teacher ? "sm:hidden" : ""}`}
            >
              {academy.logo_path ? (
                <div className="relative h-9 w-9 shrink-0">
                  <Image
                    src={academy.logo_path}
                    alt={academyName}
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <BrandMark className="h-9 w-9 shrink-0" />
              )}
              <span className="flex min-w-0 flex-col leading-tight">
                {/* `truncate` rather than wrapping: a long academy name used to
                    break onto three lines and push the header out of shape. */}
                <span
                  className="truncate font-display text-base font-bold leading-snug dark:text-brand-300 sm:text-lg"
                  style={{ color: academy.primary_color }}
                >
                  {academyName}
                </span>
                {/* Dropped on phones: with the admin button in the row too, the
                    tagline was squeezing the academy's own name into an ellipsis. */}
                {academyTagline && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">
                    {academyTagline}
                  </span>
                )}
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {/*
                A visitor has no navigation of their own, so the two ways into the
                site stay in the header for them. A signed-in teacher reaches both
                from the bottom bar (phone) or the side rail (desktop), and
                repeating them here is what made this row too crowded to read.
              */}
              {!teacher && (
                <>
                  <Link
                    href={`/${academySlug}/schedule`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle
                               px-3 py-1.5 text-sm font-medium text-muted-foreground
                               transition-colors hover:border-brand-600 hover:text-brand-700
                               dark:hover:text-brand-300 whitespace-nowrap"
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{tNav("schedule")}</span>
                  </Link>
                  <Link
                    href={`/${academySlug}/admin`}
                    aria-label={tNav("adminSignIn")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle
                               px-3 py-1.5 text-sm font-medium text-muted-foreground
                               transition-colors hover:border-brand-600 hover:text-brand-700
                               dark:hover:text-brand-300 whitespace-nowrap"
                  >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{tNav("adminSignIn")}</span>
                  </Link>
                </>
              )}
              <LanguageToggle />
            </div>
          </div>
        </header>

        {/* Extra bottom padding on phones so the fixed bar never covers the last
            row of a page; from `sm` up the bar is not rendered at all. */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 max-sm:pb-28">
          {children}
        </main>

      </div>

      {teacher && (
        <BottomNav
          academySlug={academySlug}
          isAdmin={teacher.role === "admin"}
          teacherName={getTeacherDisplayLabel(teacher, academySlug, locale)}
          roleLabel={tDashboard(`role.${teacher.role}`)}
          signOutAction={signOut.bind(null, academySlug)}
        />
      )}
    </>
  );
}
