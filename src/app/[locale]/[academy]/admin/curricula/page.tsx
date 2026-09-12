import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink, ChevronForward } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { canSupervise } from "@/lib/auth/roles";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { curriculumLabel, loadCurricula } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";
import { deleteCurriculum, setCurriculumActive } from "./actions";
import { CurriculumForm } from "./curriculum-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.curricula" });
  return { title: t("title") };
}

export default async function CurriculaPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Any approved معلمة may prepare a curriculum, not just a مشرفة — see the
  // note at the top of ./actions.ts. Deleting is gated separately below.
  const session = await requireStaffSession(`/${academySlug}/admin/curricula`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.curricula");
  const supabase = await createClient();

  const [circleTypes, curricula] = await Promise.all([
    loadCircleTypes(supabase, academy.id),
    // `activeOnly: false` — a retired curriculum still has to be visible to
    // whoever wants to bring it back.
    loadCurricula(supabase, academy.id, { activeOnly: false }),
  ]);

  // One query for every curriculum's unit count rather than one per card: a
  // منهج with 40 أحاديث is normal, and a list of them is the common case.
  const { data: unitRows } = await supabase
    .from("curriculum_units")
    .select("curriculum_id")
    .in("curriculum_id", curricula.map((c) => c.id).length ? curricula.map((c) => c.id) : [""]);

  const unitCounts = new Map<string, number>();
  for (const row of unitRows ?? []) {
    unitCounts.set(row.curriculum_id, (unitCounts.get(row.curriculum_id) ?? 0) + 1);
  }

  const mayDelete = canSupervise(session.teacher);

  // Grouped by circle type so حلقة الحديث's curricula and حلقة التجويد's never
  // read as one undifferentiated list.
  const byType = new Map<string, typeof curricula>();
  for (const curriculum of curricula) {
    const list = byType.get(curriculum.circle_type) ?? [];
    list.push(curriculum);
    byType.set(curriculum.circle_type, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      <CurriculumForm
        academySlug={academySlug}
        circleTypes={circleTypes}
        locale={locale}
      />

      {curricula.length === 0 ? (
        <p className="card text-muted-foreground">{t("empty")}</p>
      ) : (
        [...byType.entries()].map(([type, list]) => (
          <section key={type}>
            <h2 className="mb-3 text-lg font-semibold">
              {circleTypeLabel(circleTypes, type, locale)}
            </h2>
            <ul className="flex flex-col gap-3">
              {list.map((curriculum) => (
                <li key={curriculum.id} className="card flex flex-col gap-3">
                  <Link
                    href={`/${academySlug}/admin/curricula/${curriculum.id}`}
                    className="flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {curriculumLabel(curriculum, locale)}
                        {!curriculum.is_active && (
                          <span className="ms-2 text-sm font-normal text-muted-foreground">
                            {t("inactiveTag")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {t("unitCount", {
                          count: String(unitCounts.get(curriculum.id) ?? 0),
                        })}
                        {curriculum.description ? ` · ${curriculum.description}` : ""}
                      </p>
                    </div>
                    <ChevronForward />
                  </Link>

                  <div className="flex flex-wrap gap-2">
                    <form action={setCurriculumActive}>
                      <input type="hidden" name="academySlug" value={academySlug} />
                      <input type="hidden" name="curriculumId" value={curriculum.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={curriculum.is_active ? "0" : "1"}
                      />
                      <button
                        type="submit"
                        className={
                          curriculum.is_active
                            ? "btn-secondary px-4 py-2 text-sm"
                            : "btn-primary px-4 py-2 text-sm"
                        }
                      >
                        {curriculum.is_active ? t("deactivate") : t("activate")}
                      </button>
                    </form>

                    {/*
                      Deleting cascades to every unit — and to the lessons that
                      pointed at them. Withheld from a معلمة here and refused
                      by `curricula_delete_supervisor` in the database either
                      way; this only spares her a button that would fail.
                    */}
                    {mayDelete && (
                      <form action={deleteCurriculum}>
                        <input type="hidden" name="academySlug" value={academySlug} />
                        <input type="hidden" name="curriculumId" value={curriculum.id} />
                        <ConfirmButton
                          label={t("delete")}
                          confirmMessage={t("confirmDelete", {
                            name: curriculumLabel(curriculum, locale),
                          })}
                          className="btn-danger"
                        />
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
