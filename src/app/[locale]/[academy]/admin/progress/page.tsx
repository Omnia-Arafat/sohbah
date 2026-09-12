import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireStaffSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { curriculumLabel, loadCurricula } from "@/lib/curricula";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
  searchParams: Promise<{ curriculum?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.progress" });
  return { title: t("title") };
}

export default async function ProgressReportPage({ params, searchParams }: PageProps) {
  const { locale, academy: academySlug } = await params;
  const { curriculum: selected } = await searchParams;
  setRequestLocale(locale);

  await requireStaffSession(`/${academySlug}/admin/progress`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.progress");
  const supabase = await createClient();

  const [curricula, circleTypes] = await Promise.all([
    loadCurricula(supabase, academy.id, { activeOnly: false }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);

  const { data: rows, error } = await supabase.rpc("curriculum_progress_report", {
    p_academy_id: academy.id,
    p_curriculum_id: selected || null,
  });

  if (error) console.error("curriculum_progress_report failed", error);

  const report = rows ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {/*
        Plain links rather than a <select>: the filter has to survive a reload
        and be shareable — a مشرفة sending "the Forty Hadith progress" to a
        معلمة should be sending a URL, not an instruction to click twice.
      */}
      {curricula.length > 0 && (
        <nav className="flex flex-wrap gap-2">
          <Link
            href={`/${academySlug}/admin/progress`}
            className={
              selected
                ? "btn-secondary px-4 py-2 text-sm"
                : "btn-primary px-4 py-2 text-sm"
            }
          >
            {t("allCurricula")}
          </Link>
          {curricula.map((item) => (
            <Link
              key={item.id}
              href={`/${academySlug}/admin/progress?curriculum=${item.id}`}
              className={
                selected === item.id
                  ? "btn-primary px-4 py-2 text-sm"
                  : "btn-secondary px-4 py-2 text-sm"
              }
            >
              {curriculumLabel(item, locale)}
              <span className="ms-1 text-xs opacity-70">
                ({circleTypeLabel(circleTypes, item.circle_type, locale)})
              </span>
            </Link>
          ))}
        </nav>
      )}

      {report.length === 0 ? (
        <p className="card text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {report.map((row) => {
            const done = Number(row.units_done);
            const total = Number(row.units_total);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <li
                key={`${row.student_id}-${row.curriculum_id}`}
                className="card flex flex-col gap-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {row.student_name} {row.father_name}
                  </p>
                  <p className="text-sm font-medium" dir="ltr">
                    {done} / {total}
                  </p>
                </div>

                {/* A bar, because "18 of 40" is a number and "nearly half" is
                    the thing she is actually looking for. */}
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
                  role="img"
                  aria-label={t("percentLabel", { pct: String(pct) })}
                >
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  {locale === "ar" ? row.curriculum_ar : row.curriculum_en}
                  {row.last_unit_ar ? ` · ${t("lastUnit", { unit: row.last_unit_ar })}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Said plainly rather than left to be discovered: a recitation only counts
        towards a curriculum if the معلمة had set the day's lesson. A تسميع حر
        circle records nothing here, and that is correct.
      */}
      <p className="text-sm text-muted-foreground">{t("howItWorks")}</p>
    </div>
  );
}
