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

type LoginPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<LoginPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("title") };
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

  // Nothing to do here for someone who can already work.
  const session = await getTeacherSession();
  if (isActiveTeacher(session)) {
    redirect(`/${locale}/${academySlug}/dashboard`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      <TeacherLoginForm academySlug={academySlug} next={next ?? null} />

      <p className="text-center text-sm text-muted-foreground">
        {t("studentsNote")}
      </p>

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
