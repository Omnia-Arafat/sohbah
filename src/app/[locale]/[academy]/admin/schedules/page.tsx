import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireSupervisorSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadScheduleBoards } from "@/lib/schedule-boards";
import { createClient } from "@/lib/supabase/server";
import {
  createBoardForType,
  createScheduleBoard,
  deleteScheduleBoard,
  setScheduleBoardPublished,
} from "./actions";
import { ScheduleBoardForm } from "./board-form";

type PageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/** Authorized route: never prerender it. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.schedules" });
  return { title: t("title") };
}

export default async function SchedulesAdminPage({ params }: PageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  await requireSupervisorSession(`/${academySlug}/admin/schedules`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.schedules");
  const tDashboard = await getTranslations("dashboard");

  const supabase = await createClient();
  const [boards, types, { data: activeCircles }] = await Promise.all([
    loadScheduleBoards(supabase, academy.id, { publishedOnly: false }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
    supabase
      .from("circles")
      .select("type")
      .eq("academy_id", academy.id)
      .eq("is_active", true),
  ]);

  const typeOptions = types.map((type) => ({
    slug: type.slug,
    label: locale === "ar" ? type.name_ar : type.name_en,
  }));

  /*
    The public timetable renders *boards*. A circle whose type has no published
    board is therefore invisible on it — no error, no empty row, just absent.
    That is easy to cause (add a type, add circles, forget the board) and
    impossible to notice from this screen, which until now only listed the
    boards that did exist.

    So count the circles that are currently falling through, per type, and say
    so at the top of the page with the one-tap fix next to it.
  */
  const circlesByType = new Map<string, number>();
  for (const circle of activeCircles ?? []) {
    circlesByType.set(circle.type, (circlesByType.get(circle.type) ?? 0) + 1);
  }

  const coveredTypes = new Set(
    boards.filter((board) => board.is_published).map((board) => board.circle_type),
  );

  const uncovered = [...circlesByType.entries()]
    .filter(([slug]) => !coveredTypes.has(slug))
    .map(([slug, count]) => ({
      slug,
      count,
      label: circleTypeLabel(types, slug, locale),
      // A board exists but is still a draft — publishing it is the fix, not
      // creating another one.
      hasDraft: boards.some((board) => board.circle_type === slug),
    }))
    .sort((a, b) => b.count - a.count);

  const hiddenCount = uncovered.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>

        {uncovered.length > 0 && (
          <div className="card mt-4 border-accent-300 bg-accent-50 dark:border-accent-700 dark:bg-surface">
            <p className="font-semibold text-accent-800 dark:text-accent-200">
              {t("uncovered.title", { count: String(hiddenCount) })}
            </p>
            <p className="mt-1 text-sm text-accent-800 dark:text-accent-200">
              {t("uncovered.hint")}
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {uncovered.map((entry) => (
                <li
                  key={entry.slug}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3"
                >
                  <span className="text-sm">
                    <span className="font-medium">{entry.label}</span>
                    {" — "}
                    {t("uncovered.circleCount", { count: String(entry.count) })}
                  </span>

                  {entry.hasDraft ? (
                    <span className="text-sm text-muted-foreground">
                      {t("uncovered.draftExists")}
                    </span>
                  ) : (
                    <form action={createBoardForType}>
                      <input type="hidden" name="academySlug" value={academySlug} />
                      <input type="hidden" name="circleType" value={entry.slug} />
                      <button type="submit" className="btn-primary px-4 py-2 text-sm">
                        {t("uncovered.create")}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link
          href={`/${academySlug}/schedule`}
          className="btn-secondary mt-3 inline-flex px-4 py-2 text-sm"
        >
          {t("viewPublic")}
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("addTitle")}</h2>
        {typeOptions.length === 0 ? (
          <p className="card text-muted-foreground">{t("noTypes")}</p>
        ) : (
          <ScheduleBoardForm
            academySlug={academySlug}
            circleTypes={typeOptions}
            action={createScheduleBoard}
            submitLabel={t("add")}
            submittingLabel={t("adding")}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {t("boardList", { count: String(boards.length) })}
        </h2>
        {boards.length === 0 ? (
          <p className="card text-muted-foreground">{t("noBoards")}</p>
        ) : (
          <ul className="scroll-list flex flex-col gap-3">
            {boards.map((board) => (
              <li key={board.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {locale === "ar" ? board.title_ar : board.title_en}
                    {!board.is_published && (
                      <span className="badge-waiting ms-2">{t("draft")}</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {circleTypeLabel(types, board.circle_type, locale)}
                    {" · "}
                    {board.gender_category
                      ? tDashboard(`gender.${board.gender_category}`)
                      : t("fields.genderBoth")}
                    {(board.start_from || board.start_to) && (
                      <>
                        {" · "}
                        {t("windowLabel", {
                          from: board.start_from
                            ? String(board.start_from).slice(0, 5)
                            : "—",
                          to: board.start_to ? String(board.start_to).slice(0, 5) : "—",
                        })}
                      </>
                    )}
                    {" · "}
                    {t("orderLabel", { order: String(board.display_order) })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={setScheduleBoardPublished}>
                    <input type="hidden" name="boardId" value={board.id} />
                    <input type="hidden" name="academySlug" value={academySlug} />
                    <input
                      type="hidden"
                      name="isPublished"
                      value={board.is_published ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      className={
                        board.is_published
                          ? "btn-secondary px-4 py-2 text-sm"
                          : "btn-primary px-4 py-2 text-sm"
                      }
                    >
                      {board.is_published ? t("unpublish") : t("publish")}
                    </button>
                  </form>

                  <Link
                    href={`/${academySlug}/admin/schedules/${board.id}/edit`}
                    className="btn-secondary px-4 py-2 text-sm"
                  >
                    {t("edit")}
                  </Link>

                  <form action={deleteScheduleBoard}>
                    <input type="hidden" name="boardId" value={board.id} />
                    <input type="hidden" name="academySlug" value={academySlug} />
                    <ConfirmButton
                      label={t("delete")}
                      confirmMessage={t("confirmDelete", {
                        name: locale === "ar" ? board.title_ar : board.title_en,
                      })}
                      className="btn-danger"
                    />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
