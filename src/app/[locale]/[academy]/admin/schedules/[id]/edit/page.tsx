import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import { loadCircleTypes } from "@/lib/circle-types";
import { createClient } from "@/lib/supabase/server";
import { updateScheduleBoard } from "../../actions";
import { ScheduleBoardForm } from "../../board-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.schedules" });
  return { title: t("editTitle") };
}

export default async function EditScheduleBoardPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  await requireAdminSession(`/${academySlug}/admin/schedules/${id}/edit`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.schedules");
  const supabase = await createClient();

  const { data: board } = await supabase
    .from("schedule_boards")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .maybeSingle();

  if (!board) notFound();

  const types = await loadCircleTypes(supabase, academy.id, { activeOnly: false });

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/schedules`}>{t("backToBoards")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{t("editTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("editSubtitle")}</p>
      </section>

      <ScheduleBoardForm
        academySlug={academySlug}
        circleTypes={types.map((type) => ({
          slug: type.slug,
          label: locale === "ar" ? type.name_ar : type.name_en,
        }))}
        action={updateScheduleBoard}
        boardId={board.id}
        initial={{
          titleAr: board.title_ar,
          titleEn: board.title_en,
          circleType: board.circle_type,
          gender: board.gender_category ?? "",
          // `time` inputs take HH:MM; PostgreSQL hands back HH:MM:SS.
          startFrom: board.start_from ? String(board.start_from).slice(0, 5) : "",
          startTo: board.start_to ? String(board.start_to).slice(0, 5) : "",
          noteAr: board.note_ar ?? "",
          noteEn: board.note_en ?? "",
          displayOrder: String(board.display_order),
        }}
        submitLabel={t("saveChanges")}
        submittingLabel={t("saving")}
      />
    </div>
  );
}
