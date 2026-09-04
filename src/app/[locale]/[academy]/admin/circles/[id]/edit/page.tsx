import { canEditAnyCircle } from "@/lib/auth/roles";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { requireTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { createClient } from "@/lib/supabase/server";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { loadCircleTypes } from "@/lib/circle-types";
import { notFound } from "next/navigation";
import { EditCircleForm } from "./edit-form";

type EditCirclePageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: EditCirclePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.circles" });
  return { title: t("editTitle") };
}

export default async function EditCirclePage({ params }: EditCirclePageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.circles");
  const tAdmin = await getTranslations("admin");
  const session = await requireTeacherSession(`/${academySlug}/admin/circles`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  const supabase = await createClient();

  const { data: circle, error } = await supabase
    .from("circles")
    .select("*")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .single();

  if (error || !circle) notFound();

  // A supervisor or admin edits any circle in the academy; a teacher edits the
  // ones that are hers. Checked after the circle loads, because whose it is is
  // half the question — the same rule the save action and the database policy
  // (`circles_update_own_or_supervisor`) both apply.
  if (
    !canEditAnyCircle(session.teacher) &&
    circle.teacher_id !== session.teacher.id
  ) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold">{tAdmin("accessDenied")}</h2>
        <p className="mt-2 text-muted-foreground">{tAdmin("adminRequired")}</p>
      </div>
    );
  }

  const { data: teachers } = await supabase
    .from("teachers")
    .select("id, name, role")
    .eq("academy_id", academy.id)
    .eq("is_active", true)
    .order("name");

  // Includes deactivated types so a circle already using one keeps showing its
  // actual type in the dropdown instead of it silently vanishing.
  const allTypes = await loadCircleTypes(supabase, academy.id, { activeOnly: false });
  const circleTypes = allTypes
    .filter((type) => type.is_active || type.slug === circle.type)
    .map((type) => ({
      slug: type.slug,
      label: locale === "ar" ? type.name_ar : type.name_en,
    }));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-6">
        <section>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("editTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("editSubtitle")}</p>
        </section>

        <BackLink href={`/${academySlug}/admin/circles`}>{t("backToCircles")}</BackLink>

        <EditCircleForm
          circle={circle}
          teachers={teachers || []}
          circleTypes={circleTypes}
          academySlug={academySlug}
        />
      </div>
    </div>
  );
}
