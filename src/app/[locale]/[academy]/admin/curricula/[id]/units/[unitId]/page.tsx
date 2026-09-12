import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { curriculumLabel, loadCurriculum, unitLabel } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { UnitForm } from "../../unit-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string; unitId: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.curricula.units" });
  return { title: t("editTitle") };
}

export default async function EditUnitPage({ params }: PageProps) {
  const { locale, academy: academySlug, id, unitId } = await params;
  setRequestLocale(locale);

  await requireStaffSession(`/${academySlug}/admin/curricula/${id}/units/${unitId}`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.curricula.units");
  const supabase = await createClient();

  const curriculum = await loadCurriculum(supabase, academy.id, id);
  if (!curriculum) notFound();

  // Scoped by curriculum_id as well as id: a unit id from another academy's
  // curriculum must 404 here rather than open someone else's lesson.
  const { data: unit } = await supabase
    .from("curriculum_units")
    .select("*")
    .eq("id", unitId)
    .eq("curriculum_id", curriculum.id)
    .maybeSingle();

  if (!unit) notFound();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/curricula/${curriculum.id}`}>
          {curriculumLabel(curriculum, locale)}
        </BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {unitLabel(unit, locale)}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("editSubtitle")}</p>
      </section>

      <UnitForm
        academySlug={academySlug}
        curriculumId={curriculum.id}
        unit={unit}
      />
    </div>
  );
}
