import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { redirect } from "next/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { TeacherLoginForm } from "./teacher-login-form";
import { SignInTabs } from "./sign-in-tabs";
import { getLocalizedAcademyName } from "@/lib/academy-display";

type LoginPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<LoginPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  // Matches the heading: the page is sign-in, not staff sign-in.
  return { title: t("pageTitle") };
}

export default async function LoginPage({
  params,
  searchParams,
}: LoginPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const { next } = await searchParams;
  const t = await getTranslations("auth");
  const academyName = await getLocalizedAcademyName(academySlug, locale, academy);

  // Nothing to do here for someone who can already work.
  const session = await getTeacherSession();
  if (isActiveTeacher(session)) {
    redirect(`/${locale}/${academySlug}/dashboard`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      {/*
        "تسجيل الدخول", not "دخول المعلمين والمشرفين". The old heading answered
        the tab that is open rather than the page, and a student who arrives
        here — which she does, from the header icon — was told in the first
        line that this screen was not for her before she saw the tab that is.
      */}
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("pageTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{academyName}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      {/* The staff form is passed through unchanged — same component, same
          server action, same fields. Only what surrounds it is new. */}
      <SignInTabs
        academySlug={academySlug}
        staffForm={
          <TeacherLoginForm academySlug={academySlug} next={next ?? null} />
        }
      />

      {/* The only route to the registration form — someone registering has no
          account yet, so the sign-in page is where they will look. */}
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccountYet")}{" "}
        <Link
          href={`/${academySlug}/register-teacher`}
          className="font-medium text-brand-700 underline dark:text-brand-300"
        >
          {t("registerAccount")}
        </Link>
      </p>
    </div>
  );
}
