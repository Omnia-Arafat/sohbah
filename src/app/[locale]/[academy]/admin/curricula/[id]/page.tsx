import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronDown, ChevronUp } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { curriculumLabel, loadCurriculum, loadUnits, unitLabel } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { deleteUnit, moveUnit } from "./actions";
import { UnitForm } from "./unit-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.curricula" });
  return { title: t("title") };
}

export default async function CurriculumPage({ params }: PageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const session = await requireStaffSession(`/${academySlug}/admin/curricula/${id}`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.curricula");
  const tUnits = await getTranslations("admin.curricula.units");
  const supabase = await createClient();

  const curriculum = await loadCurriculum(supabase, academy.id, id);
  if (!curriculum) notFound();

  const [units, circleTypes] = await Promise.all([
    loadUnits(supabase, curriculum.id),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);

  const mayDelete = canSupervise(session.teacher);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin/curricula`}>
          {t("backToList")}
        </BackLink>
        <p className="mt-2 text-sm text-muted-foreground">
          {circleTypeLabel(circleTypes, curriculum.circle_type, locale)}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">
          {curriculumLabel(curriculum, locale)}
        </h1>
        {curriculum.description && (
          <p className="mt-2 text-muted-foreground">{curriculum.description}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {tUnits("listTitle", { count: String(units.length) })}
        </h2>

        {units.length === 0 ? (
          <p className="card text-muted-foreground">{tUnits("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {units.map((unit, index) => (
              <li key={unit.id} className="card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {unit.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{unitLabel(unit, locale)}</p>
                    {unit.body && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {unit.body}
                      </p>
                    )}
                    {(unit.narrator || unit.source_book || unit.grade) && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[unit.narrator, unit.source_book, unit.grade]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/*
                    Up/down rather than drag-and-drop: this list is edited on a
                    phone as often as a laptop, and a 40-unit منهج is reordered
                    once and then left alone.
                  */}
                  <form action={moveUnit}>
                    <input type="hidden" name="academySlug" value={academySlug} />
                    <input type="hidden" name="curriculumId" value={curriculum.id} />
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      className="btn-secondary px-3 py-2 text-sm disabled:opacity-40"
                      disabled={index === 0}
                      aria-label={tUnits("moveUp")}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>

                  <form action={moveUnit}>
                    <input type="hidden" name="academySlug" value={academySlug} />
                    <input type="hidden" name="curriculumId" value={curriculum.id} />
                    <input type="hidden" name="unitId" value={unit.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      className="btn-secondary px-3 py-2 text-sm disabled:opacity-40"
                      disabled={index === units.length - 1}
                      aria-label={tUnits("moveDown")}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>

                  <Link
                    href={`/${academySlug}/admin/curricula/${curriculum.id}/units/${unit.id}`}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    {tUnits("edit")}
                  </Link>

                  {mayDelete && (
                    <form action={deleteUnit}>
                      <input type="hidden" name="academySlug" value={academySlug} />
                      <input type="hidden" name="curriculumId" value={curriculum.id} />
                      <input type="hidden" name="unitId" value={unit.id} />
                      <ConfirmButton
                        label={tUnits("delete")}
                        confirmMessage={tUnits("confirmDelete", {
                          name: unitLabel(unit, locale),
                        })}
                        className="btn-danger"
                      />
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{tUnits("addTitle")}</h2>
        <UnitForm academySlug={academySlug} curriculumId={curriculum.id} />
      </section>
    </div>
  );
}
