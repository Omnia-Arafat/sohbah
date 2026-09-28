import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CreateForm } from "./create-form";

type NewChallengePageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export async function generateMetadata({ params }: NewChallengePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "challenges.create" });
  return { title: t("title") };
}

/** Any active معلمة or مشرفة may start a challenge. */
export default async function NewChallengePage({ params }: NewChallengePageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const session = await requireTeacherSession(`/${academySlug}/challenges/new`);
  if (!isActiveTeacher(session)) {
    return <TeacherAccountNotice reason={session.teacher ? "inactive" : "notLinked"} email={session.email} />;
  }

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  // The حلقات a challenge can be aimed at: this academy's running ones.
  const supabase = await createClient();
  const { data: circles, error } = await supabase
    .from("circles")
    .select("id, name")
    .eq("academy_id", academy.id)
    .eq("is_active", true)
    .order("name");
  if (error) console.error("circles for challenge failed", error);

  return <CreateForm academySlug={academySlug} locale={locale} circles={circles ?? []} />;
}
