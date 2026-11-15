import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ locale: string; academy: string; id: string; week: string }>;
};

/**
 * The old one-week editor. Weeks are now written in the schedule builder,
 * which can also apply a week to several tracks and cohorts; links that
 * still point here (the week band, admin alerts) land on that week there.
 */
export default async function WeekPage({ params }: PageProps) {
  const { locale, academy, id, week } = await params;
  const n = Number(week);
  const prefix = `/${locale}`;
  redirect(
    `${prefix}/${academy}/admin/tracks/schedules/new?track=${id}&cohort=base&week=${Number.isInteger(n) && n > 0 ? n : 1}`,
  );
}
