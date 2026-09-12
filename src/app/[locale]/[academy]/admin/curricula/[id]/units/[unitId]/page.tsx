import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { curriculumLabel, loadCurriculum, unitLabel } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { loadUnitMaterials, withSignedUrls } from "@/lib/materials";
import { deleteMaterial } from "../../actions";
import { MaterialForm } from "../../material-form";
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
  const tMaterials = await getTranslations("admin.curricula.materials");
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

  // Signed per request: the bucket is private, so there is no stored URL to
  // reuse and nothing to leak if this page is ever cached.
  const materials = await withSignedUrls(
    await loadUnitMaterials(supabase, unit.id),
  );

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

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {tMaterials("listTitle", { count: String(materials.length) })}
        </h2>

        {materials.length === 0 ? (
          <p className="card text-muted-foreground">{tMaterials("empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {materials.map((material) => (
              <li key={material.id} className="card flex flex-col gap-3">
                {/*
                  A stored image is shown; a link is offered as a link. `href`
                  is a short-lived signed URL for the first kind — the bucket is
                  private, so there is no permanent address to embed.
                */}
                {material.kind === "image" && material.href && (
                  // eslint-disable-next-line @next/next/no-img-element -- a
                  // signed URL changes every render, so next/image's optimizer
                  // would re-fetch and re-cache it on every single load.
                  <img
                    src={material.href}
                    alt={material.title}
                    className="max-h-56 w-full rounded-xl object-contain"
                  />
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{material.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {tMaterials(`kinds.${material.kind}`)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {material.kind !== "image" && material.href && (
                      <a
                        href={material.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-4 py-2 text-sm"
                      >
                        {tMaterials("open")}
                      </a>
                    )}

                    <form action={deleteMaterial}>
                      <input type="hidden" name="academySlug" value={academySlug} />
                      <input type="hidden" name="curriculumId" value={curriculum.id} />
                      <input type="hidden" name="unitId" value={unit.id} />
                      <input type="hidden" name="materialId" value={material.id} />
                      <ConfirmButton
                        label={tMaterials("delete")}
                        confirmMessage={tMaterials("confirmDelete", {
                          name: material.title,
                        })}
                        className="btn-danger"
                      />
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{tMaterials("addTitle")}</h2>
        <MaterialForm
          academySlug={academySlug}
          curriculumId={curriculum.id}
          unitId={unit.id}
        />
      </section>
    </div>
  );
}
