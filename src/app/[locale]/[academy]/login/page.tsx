import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { notFound } from "next/navigation";
import { SignInScreen } from "./sign-in-screen";

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

  // Nothing to do here for someone who can already work.
  const session = await getTeacherSession();
  if (isActiveTeacher(session)) {
    redirect(`/${locale}/${academySlug}/dashboard`);
  }

  return (
    <SignInScreen
      academy={academy}
      academySlug={academySlug}
      locale={locale}
      next={next ?? null}
    />
  );
}

