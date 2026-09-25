import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { DayBoard } from "./day-board";

type PageProps = {
  params: Promise<{
    locale: string;
    academy: string;
    id: string;
    cohortId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cohortDay" });
  return { title: t("title") };
}

/**
 * Today in the academy's own timezone, so the board opens on the day the
 * cohort is living rather than the day the reader's laptop believes.
 */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function CohortDayPage({ params }: PageProps) {
  const { locale, academy: academySlug, id, cohortId } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("cohortDay");
  const session = await getTeacherSession();

  // Every معلمة of the academy may look, not only a مشرفة: this is her own
  // cohort's day. The function checks the academy again for itself.
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
      <BackLink href={`/${academySlug}/admin/tracks/${id}/cohorts/${cohortId}`}>
        {t("back")}
      </BackLink>

      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <DayBoard cohortId={cohortId} initialDate={today()} />
    </div>
  );
}
