import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { loadCircleSlots } from "@/lib/schedule-boards";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MeClient } from "./me-client";

type MePageProps = {
  params: Promise<{ locale: string; academy: string }>;
};

/**
 * The student's own page.
 *
 * Everything here is rendered on the client, which is unusual for this app
 * and deliberate: who the reader is lives in her own browser (see
 * `me-store.ts`) because students have no accounts, so the server has nothing
 * to render a personalised page FROM. Rendering the shell on the server and
 * the record on the client keeps her name and her phone number out of every
 * server log and CDN cache between here and her.
 */
export async function generateMetadata({
  params,
}: MePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "me" });
  return { title: t("title") };
}

export default async function MePage({ params }: MePageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("me");

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <SetupNotice />
      </div>
    );
  }

  const academy = await getAcademyBySlug(academySlug);
  const supabase = await createClient();
  const [circleTypes, slots] = academy
    ? await Promise.all([
        loadCircleTypes(supabase, academy.id, { activeOnly: false }),
        loadCircleSlots(academy.id),
      ])
    : [[], new Map<string, { daysOfWeek: number[]; startTime: string }>()];

  return (
    <MeClient
      academySlug={academySlug}
      locale={locale}
      typeLabels={Object.fromEntries(
        circleTypes.map((type) => [type.slug, circleTypeLabel(circleTypes, type.slug, locale)]),
      )}
      slots={Object.fromEntries(slots)}
    />
  );
}
