import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import { loadCircleTypes } from "@/lib/circle-types";
import { createClient } from "@/lib/supabase/server";
import { deleteCircleType, setCircleTypeActive } from "./actions";
import { CircleTypeForm } from "./circle-type-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.circleTypes" });
  return { title: t("title") };
}

export default async function CircleTypesPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  // Managing the academy's taxonomy is مشرفة-only, unlike the read-mostly
  // screens elsewhere in /admin — there is no "view but not add" role for this.
  await requireAdminSession(`/${academySlug}/admin/circle-types`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.circleTypes");

  const supabase = await createClient();
  const types = await loadCircleTypes(supabase, academy.id, { activeOnly: false });

  // Circles referencing a type are what the delete-blocking FK protects; the
  // page needs the same count to explain why a type cannot simply be removed.
  const { data: circles } = await supabase
    .from("circles")
    .select("type")
    .eq("academy_id", academy.id);
  const usage = new Map<string, number>();
  for (const circle of circles ?? []) {
    usage.set(circle.type, (usage.get(circle.type) ?? 0) + 1);
  }

  const active = types.filter((type) => type.is_active);
  const inactive = types.filter((type) => !type.is_active);

  function TypeRow({ type }: { type: (typeof types)[number] }) {
    const count = usage.get(type.slug) ?? 0;
    return (
      <li className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {locale === "ar" ? type.name_ar : type.name_en}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {locale === "ar" ? type.name_en : type.name_ar}
            {" · "}
            {t("circleCount", { count: String(count) })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={setCircleTypeActive}>
            <input type="hidden" name="typeId" value={type.id} />
            <input type="hidden" name="academySlug" value={academySlug} />
            <input
              type="hidden"
              name="isActive"
              value={type.is_active ? "0" : "1"}
            />
            <button
              type="submit"
              className={
                type.is_active
                  ? "btn-secondary px-4 py-2 text-sm"
                  : "btn-primary px-4 py-2 text-sm"
              }
            >
              {type.is_active ? t("deactivate") : t("activate")}
            </button>
          </form>

          <Link
            href={`/${academySlug}/admin/circle-types/${type.id}/edit`}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {t("edit")}
          </Link>

          {/*
            A type still used by a circle cannot be deleted — the database
            itself refuses it (fk_circles_type has no ON DELETE clause, so it
            defaults to RESTRICT). The button is withheld rather than shown
            and then refused, matching how the teachers page treats a teacher
            who still owns circles.
          */}
          {count === 0 && (
            <form action={deleteCircleType}>
              <input type="hidden" name="typeId" value={type.id} />
              <input type="hidden" name="academySlug" value={academySlug} />
              <ConfirmButton
                label={t("delete")}
                confirmMessage={t("confirmDelete", {
                  name: locale === "ar" ? type.name_ar : type.name_en,
                })}
                className="rounded-xl border border-absent px-4 py-2 text-sm
                           font-semibold text-absent transition-colors
                           hover:bg-absent hover:text-white"
              />
            </form>
          )}
        </div>
      </li>
    );
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

      <CircleTypeForm academySlug={academySlug} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("activeList", { count: String(active.length) })}
        </h2>
        {active.length === 0 ? (
          <p className="card text-muted-foreground">{t("noActive")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((type) => (
              <TypeRow key={type.id} type={type} />
            ))}
          </ul>
        )}
      </section>

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {t("inactiveList", { count: String(inactive.length) })}
          </h2>
          <ul className="flex flex-col gap-3">
            {inactive.map((type) => (
              <TypeRow key={type.id} type={type} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
