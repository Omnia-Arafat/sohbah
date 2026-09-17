import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogIn } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { BottomNav } from "@/components/bottom-nav";
import { PublicNav } from "@/components/public-nav";
import { PublicNavDesktop } from "@/components/public-nav-desktop";
import { BrandMark } from "@/components/brand-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { SideNav } from "@/components/side-nav";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/app/[locale]/[academy]/login/actions";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getLocalizedAcademyName, getTeacherDisplayLabel } from "@/lib/academy-display";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { canSupervise, isAdminRole, primaryRoleKey } from "@/lib/auth/roles";

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
          isAdmin={isAdminRole(teacher)}
          teacherName={getTeacherDisplayLabel(teacher, academySlug, locale)}
          roleLabel={tDashboard(`role.${primaryRoleKey(teacher)}`)}
          signOutAction={signOut.bind(null, academySlug)}
        />
      )}

      {/* The rail is fixed, so the page is inset by its width from `sm` up
          rather than sharing a flex row with it — the header, content and
          footer keep the exact structure they had before it existed. */}
      <div className={`flex flex-1 flex-col ${teacher ? "sm:ps-63 print:ps-0" : ""}`}>
        <header className="border-b border-border-subtle bg-surface print:hidden">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
            {/* Hidden from `sm` up for a signed-in teacher: the side rail carries
                the same logo and name there, and two of them is one too many.

                Tapping the logo is how people go home, so for a signed-in
                معلمة or مشرفة it has to mean HER home. Pointing it at the
                academy root handed her the students’ page — «أهلاً بكِ في
                صحبة», today’s circles to join — which has no way into the
                dashboard on it, so she was left reading a student screen
                thinking that was her own. Reported by a مشرفة who could not
                work out where the circles she runs had gone. */}
            <Link
              href={teacher ? `/${academySlug}/dashboard` : `/${academySlug}`}
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
                  {/* الجدول used to sit here for `sm` and up, because that is
                      where the bottom bar stops. `<PublicNavDesktop>` now
                      carries it along with everything else, so keeping it would
                      be the same destination twice in one header. */}
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

          {/* The bottom bar is `sm:hidden`, so from here up a student had the
              schedule and nothing else. Same destinations, as a row. */}
          {!teacher && <PublicNavDesktop academySlug={academySlug} />}
        </header>

        {/* Extra bottom padding on phones so the fixed bar never covers the last
            row of a page; from `sm` up the bar is not rendered at all. */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 max-sm:pb-28 print:max-w-none print:p-0">
          {children}
        </main>

      </div>

      {/* A student is never signed in, so until now she had no bottom bar at
          all — she arrived on a circle link and the browser's back button was
          the only way anywhere. */}
      {!teacher && <PublicNav academySlug={academySlug} />}

      {teacher && (
        <BottomNav
          academySlug={academySlug}
          isAdmin={isAdminRole(teacher)}
          canSupervise={canSupervise(teacher)}
          teacherName={getTeacherDisplayLabel(teacher, academySlug, locale)}
          roleLabel={tDashboard(`role.${primaryRoleKey(teacher)}`)}
          signOutAction={signOut.bind(null, academySlug)}
        />
      )}
    </>
  );
}
