import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { canSupervise } from "@/lib/auth/roles";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { createClient } from "@/lib/supabase/server";
import { getTrackDetail } from "@/lib/track-detail-dal";
import { CohortForm } from "./cohort-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cohortNew" });
  return { title: t("title") };
}

export default async function NewCohortPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("cohortNew");
  const tTracks = await getTranslations("tracks");
  const tAdmin = await getTranslations("admin");
  const session = await getTeacherSession();

  if (!session || !isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session?.teacher ? "inactive" : "notLinked"}
        email={session?.email ?? null}
      />
    );
  }

  if (!canSupervise(session.teacher)) {
    return (
      <div className="card">
        <p className="font-semibold">{tAdmin("accessDenied")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tTracks("adminOnly")}</p>
      </div>
    );
  }

  const track = await getTrackDetail(academy.id, id);
  if (track === "missing-schema" || !track) notFound();

  const supabase = await createClient();
  const { data: teacherRows } = await supabase
    .from("teachers")
    .select("id, name")
    .eq("academy_id", academy.id)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <nav className="text-xs text-muted-foreground">
        <Link
          href={`/${academySlug}/admin/tracks/${track.id}`}
          className="hover:underline"
        >
          {track.name}
        </Link>
      </nav>

      <section>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("subtitle", { track: track.name })}
        </p>
      </section>

      <CohortForm
        academySlug={academySlug}
        trackId={track.id}
        defaultCapacity={track.defaultCapacity}
        teachers={teacherRows ?? []}
      />
    </div>
  );
}
