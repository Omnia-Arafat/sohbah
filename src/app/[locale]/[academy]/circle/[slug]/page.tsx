import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/server";
import { CircleClient } from "./circle-client";

type CirclePageProps = {
  params: Promise<{ locale: string; academy: string; slug: string }>;
};

async function loadCircle(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("circle_public_info", {
    p_slug: slug,
  });

  if (error) {
    console.error("circle_public_info failed", error);
    return null;
  }
  return data?.[0] ?? null;
}

export async function generateMetadata({
  params,
}: CirclePageProps): Promise<Metadata> {
  const { locale, academy: academySlug, slug } = await params;
  const t = await getTranslations({ locale, namespace: "circle" });

  if (!isSupabaseConfigured()) return { title: t("title") };

  const circle = await loadCircle(slug);
  return { title: circle?.name ?? t("notFoundPage.title") };
}

export default async function CirclePage({ params }: CirclePageProps) {
  const { locale, academy: academySlug, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("circle");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  const circle = await loadCircle(slug);
  if (!circle) notFound();

  const supabase = await createClient();
  const { data: queue } = await supabase.rpc("circle_queue", { p_slug: slug });

  return (
    <div className="flex flex-col gap-6">
      <section className="card border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
        <p className="text-sm text-muted-foreground">
          {t(`type.${circle.type}`)}
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">
          {circle.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("startsAt", { time: formatTime(circle.start_time, locale) })}
        </p>

        {!circle.meets_today && (
          <p className="mt-3 text-sm text-accent-700 dark:text-accent-300">
            {t("notToday")}
          </p>
        )}
      </section>

      <CircleClient
        academySlug={academySlug}
        slug={slug}
        circleId={circle.id}
        sessionDate={circle.session_date}
        sessionLink={circle.session_link}
        initialQueue={queue ?? []}
      />
    </div>
  );
}
