import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { ExcusesBoard } from "./excuses-board";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "excuses" });
  return { title: t("title") };
}

export default async function ExcusesPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("excuses");
  const session = await getTeacherSession();

  /*
    Every active معلمة of the academy, not مشرفات only. A معلمة is the one who
    knows whether the excuse is true — she is the one the student would have
    told — and `decide_excuse` makes the same check before it writes, so this
    door and that lock agree.
  */
  if (!session || !isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session?.teacher ? "inactive" : "notLinked"}
        email={session?.email ?? null}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>

      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ExcusesBoard academyId={academy.id} locale={locale} />
    </div>
  );
}
