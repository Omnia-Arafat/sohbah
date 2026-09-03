import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { EditCircleTypeForm } from "./edit-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.circleTypes" });
  return { title: t("editTitle") };
}

export default async function EditCircleTypePage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  await requireAdminSession(`/${academySlug}/admin/circle-types/${id}/edit`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.circleTypes");

  const supabase = await createClient();
  const { data: type, error } = await supabase
    .from("circle_types")
    .select("id, name_ar, name_en")
    .eq("id", id)
    .eq("academy_id", academy.id)
    .maybeSingle();

  if (error) console.error("circle type load failed", error);
  if (!type) notFound();

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/circle-types`}>
          {t("backToTypes")}
        </BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("editTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("editSubtitle")}</p>
      </section>

      <EditCircleTypeForm type={type} academySlug={academySlug} />
    </div>
  );
}
