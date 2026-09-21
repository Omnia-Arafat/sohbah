import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";
import { ChevronLeft, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { RegisterForm } from "./register-form";

type RegisterPageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ circle?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<RegisterPageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "register" });
  return { title: t("title") };
}

export default async function RegisterPage({
  params,
  searchParams,
}: RegisterPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Verify academy exists
  const academy = await getAcademyBySlug(academySlug);
  if (!academy) {
    notFound();
  }

  const { circle } = await searchParams;
  const t = await getTranslations("register");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      {/*
        Before the form, not after it. A student who already registered has no
        way of knowing that from this screen — the page is titled "تسجيل طالب
        جديد" and offers her the same three fields she filled last time, so she
        fills them again and the academy gets its second مريم. صفحتي asks for
        the name and number she already gave, which is the sign-in she has;
        this is the only screen where she is likely to be looking for it.
      */}
      <Link
        href={`/${academySlug}/me`}
        className="flex items-center justify-between gap-3 rounded-2xl border
                   border-border-subtle bg-surface p-4 transition-colors
                   hover:border-brand-600"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900">
            <UserRound
              aria-hidden="true"
              className="h-[18px] w-[18px] text-brand-600 dark:text-brand-300"
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-bold">{t("alreadyRegistered")}</span>
            <span className="text-xs text-muted-foreground">
              {t("alreadyRegisteredBody")}
            </span>
          </span>
        </span>
        <ChevronLeft
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180"
        />
      </Link>

      <RegisterForm
        academyId={academy.id}
        academySlug={academySlug}
        circleSlug={circle ?? null}
      />
    </div>
  );
}
