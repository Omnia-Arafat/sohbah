import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyLinkButton } from "@/components/copy-link-button";
import { DashboardHeader } from "@/components/dashboard-header";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { Link } from "@/i18n/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import type { Circle } from "@/lib/database.types";
import { formatTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/server";

type DashboardPageProps = { params: Promise<{ locale: string; academy: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: DashboardPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("dashboard");
  const tCircle = await getTranslations("circle");

  const session = await requireTeacherSession(`/${academySlug}/dashboard`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  const supabase = await createClient();
  const academy = await getAcademyBySlug(academySlug);
  const [todayResult, allResult, circleTypes] = await Promise.all([
    supabase.rpc("teacher_today_circles"),
    supabase.from("circles").select("*").eq("is_active", true).order("start_time"),
    // `activeOnly: false` — an existing circle can reference a since-
    // deactivated type, and this list still needs a real label for it.
    academy ? loadCircleTypes(supabase, academy.id, { activeOnly: false }) : [],
  ]);

  if (todayResult.error) console.error("teacher_today_circles failed", todayResult.error);
  if (allResult.error) console.error("circles select failed", allResult.error);

  const todayCircles = todayResult.data ?? [];
  const todayIds = new Set(todayCircles.map((c) => c.id));
  const otherCircles: Circle[] = (allResult.data ?? []).filter((c) => !todayIds.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={`/${academySlug}/dashboard/new`} className="btn-primary w-full sm:w-auto">
          {t("newCircle")}
        </Link>
      </section>

      <DashboardHeader teacher={session.teacher} academySlug={academySlug} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("today.title")}</h2>

        {todayCircles.length === 0 ? (
          <p className="card text-muted-foreground">{t("today.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {todayCircles.map((circle) => (
              <li key={circle.id} className="card flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {circleTypeLabel(circleTypes, circle.type, locale)} ·{" "}
                      {t(`gender.${circle.gender_category}`)}
                    </p>
                    <h3 className="truncate text-lg font-semibold">{circle.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tCircle("startsAt", { time: formatTime(circle.start_time, locale) })}
                    </p>
                  </div>
                  <span className="badge-done shrink-0">
                    {t("joinedCount", { count: String(circle.joined_count) })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/${academySlug}/dashboard/circle/${circle.id}`}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {t("manageSession")}
                  </Link>
                  <CopyLinkButton path={`/${locale}/${academySlug}/circle/${circle.registration_slug}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("other.title")}</h2>

        {otherCircles.length === 0 ? (
          <p className="card text-muted-foreground">{t("other.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {otherCircles.map((circle) => (
              <li
                key={circle.id}
                className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    {circleTypeLabel(circleTypes, circle.type, locale)} ·{" "}
                    {t(`gender.${circle.gender_category}`)}
                  </p>
                  <h3 className="truncate font-semibold">{circle.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tCircle("startsAt", { time: formatTime(circle.start_time, locale) })}
                    {" · "}
                    {circle.days_of_week
                      .slice()
                      .sort((a, b) => a - b)
                      .map((day) => t(`daysShort.${day}`))
                      .join(" ")}
                  </p>
                </div>
                <Link
                  href={`/${academySlug}/dashboard/circle/${circle.id}`}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {t("openCircle")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
