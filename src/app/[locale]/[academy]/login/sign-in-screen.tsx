import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { BrandMark } from "@/components/brand-mark";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getLocalizedAcademyName } from "@/lib/academy-display";
import type { getAcademyBySlug } from "@/lib/academy-dal";
import { TeacherLoginForm } from "./teacher-login-form";
import { SignInTabs } from "./sign-in-tabs";

type Academy = NonNullable<Awaited<ReturnType<typeof getAcademyBySlug>>>;

/**
 * The sign-in screen, shared by /login and by the academy's home page, which
 * shows it to anyone the site does not know yet. `gate` adds the one line
 * that says why she is seeing it instead of the page she opened.
 */
export async function SignInScreen({
  academy,
  academySlug,
  locale,
  next,
  gate = false,
}: {
  academy: Academy;
  academySlug: string;
  locale: string;
  next: string | null;
  gate?: boolean;
}) {
  const t = await getTranslations("auth");
  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 sm:py-6">
      {/*
        "تسجيل الدخول", not "دخول المعلمين والمشرفين". The old heading answered
        the tab that is open rather than the page, and a student who arrives
        here — which she does, from the header button — was told in the first
        line that this screen was not for her before she saw the tab that is.

        Centred under the academy's own mark. This is the one screen a person
        reaches before they are anybody here, and it was a left-aligned line of
        text over a grey box — the same page any site could have shown her. The
        mark says whose door this is before the heading says what it is for.
      */}
      <section className="flex flex-col items-center text-center">
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl
                     bg-brand-50 ring-1 ring-brand-100
                     dark:bg-brand-900 dark:ring-brand-800"
        >
          {academy.logo_path ? (
            <div className="relative h-10 w-10">
              <Image
                src={academy.logo_path}
                alt=""
                fill
                sizes="40px"
                className="object-contain"
              />
            </div>
          ) : (
            <BrandMark className="h-10 w-10" />
          )}
        </div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{academyName}</p>
        {gate && (
          <p className="mt-3 text-sm text-muted-foreground">{t("gateNote")}</p>
        )}
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      {/* The staff form is passed through unchanged — same component, same
          server action, same fields. Only what surrounds it is new. */}
      <SignInTabs
        academySlug={academySlug}
        next={next}
        staffForm={
          <TeacherLoginForm academySlug={academySlug} next={next} />
        }
      />

    </div>
  );
}
