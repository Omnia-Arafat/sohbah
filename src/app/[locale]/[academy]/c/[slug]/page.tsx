import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getTeacherSession, isActiveTeacher } from "@/lib/auth/dal";
import { getViewer, mayViewerSee } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { DhikrCounter } from "./dhikr-counter";

type DhikrPageProps = {
  params: Promise<{ locale: string; academy: string; slug: string }>;
};

async function loadChallenge(academySlug: string, slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dhikr_challenge_by_slug", {
    p_academy_slug: academySlug,
    p_slug: slug,
  });
  if (error) console.error("dhikr_challenge_by_slug failed", error);
  return { supabase, challenge: data?.[0] ?? null };
}

export async function generateMetadata({ params }: DhikrPageProps): Promise<Metadata> {
  const { academy, slug } = await params;
  const { challenge } = await loadChallenge(academy, slug);
  return { title: challenge?.title ?? "" };
}

/**
 * One challenge, by the link its معلمة shared: the ذكر, the counter, and the
 * hadith with its source.
 *
 * Open to anyone with the link, signed in or not: a stranger counts on her
 * phone and signs in to keep it. A signed-in reader of the OTHER side gets
 * the same "not found" as a wrong link — a challenge belongs to the side of
 * the one who made it, and the saves in the database refuse the other side
 * regardless.
 */
export default async function DhikrPage({ params }: DhikrPageProps) {
  const { locale, academy: academySlug, slug } = await params;
  setRequestLocale(locale);

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) notFound();

  const { supabase, challenge } = await loadChallenge(academySlug, slug);
  if (!challenge) notFound();
  const viewer = await getViewer(academy.id);
  if (viewer.kind !== "stranger" && !mayViewerSee(viewer, challenge.gender_category)) notFound();

  // The one who made it, or a مشرفة, gets the way to its results.
  const session = await getTeacherSession();
  let canManage = false;
  if (isActiveTeacher(session)) {
    const { data } = await supabase.rpc("dhikr_challenge_can_manage", { p_challenge_id: challenge.id });
    canManage = data === true;
  }

  return (
    <DhikrCounter academySlug={academySlug} locale={locale} challenge={challenge} canManage={canManage} />
  );
}
