import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { TeacherApplicationForm } from "./teacher-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "registerTeacher" });
  return { title: t("title") };
}

export default async function RegisterTeacherPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("registerTeacher");

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      <TeacherApplicationForm academyId={academy.id} academySlug={academySlug} />
    </div>
  );
}
