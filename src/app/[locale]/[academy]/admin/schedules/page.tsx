import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { requireAdminSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadScheduleBoards } from "@/lib/schedule-boards";
import { createClient } from "@/lib/supabase/server";
import {
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

  await requireAdminSession(`/${academySlug}/admin/schedules`);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const t = await getTranslations("admin.schedules");
  const tDashboard = await getTranslations("dashboard");

  const supabase = await createClient();
  const [boards, types] = await Promise.all([
    loadScheduleBoards(supabase, academy.id, { publishedOnly: false }),
    loadCircleTypes(supabase, academy.id, { activeOnly: false }),
  ]);

  const typeOptions = types.map((type) => ({
    slug: type.slug,
    label: locale === "ar" ? type.name_ar : type.name_en,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/admin`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
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
