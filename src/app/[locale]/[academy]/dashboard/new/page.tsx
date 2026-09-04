import { canSupervise } from "@/lib/auth/roles";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SetupNotice } from "@/components/setup-notice";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { BackLink } from "@/components/back-link";
import { getAcademyBySlug } from "@/lib/academy-dal";
import { getTeacherDisplayLabel } from "@/lib/academy-display";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { loadCircleTypes } from "@/lib/circle-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { CircleForm } from "./circle-form";

type NewCirclePageProps = { params: Promise<{ locale: string; academy: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: NewCirclePageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard.new" });
  return { title: t("title") };
}

/**
 * Reachable by any active teacher, role aside — deliberately. A teacher
 * assigns the circle to herself; an admin gets the extra teacher picker (see
 * `loadAssignableTeachers` below). Do not add a role check here: this stays
 * the one route that must keep working for a plain teacher and a supervisor
 * alike even after `/admin` is ever locked to admins only, since that page's
 * own "new circle" shortcut just links back to this same form.
 */
export default async function NewCirclePage({ params }: NewCirclePageProps) {
  const { locale, academy: academySlug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("dashboard.new");
  const session = await requireTeacherSession(`/${academySlug}/dashboard/new`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  // Only admins choose an owner; for everyone else the list stays empty and the
  // form falls back to a hidden field holding their own id.
  const assignableTeachers = await loadAssignableTeachers(
    canSupervise(session.teacher) ? academySlug : null,
    locale,
  );

  const academy = isSupabaseConfigured() ? await getAcademyBySlug(academySlug) : null;
  const circleTypes = academy
    ? (await loadCircleTypes(await createClient(), academy.id)).map((type) => ({
        slug: type.slug,
        label: locale === "ar" ? type.name_ar : type.name_en,
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/dashboard`}>{t("back")}</BackLink>
        <h1 className="font-display mt-2 text-2xl font-bold sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {!isSupabaseConfigured() && <SetupNotice />}

      <CircleForm
        defaultTimezone={DEFAULT_TIMEZONE}
        assignableTeachers={assignableTeachers}
        defaultTeacherId={session.teacher.id}
        circleTypes={circleTypes}
        registrationSlug={`halaqa-${randomUUID()}`}
        academySlug={academySlug}
      />
    </div>
  );
}

/** Active teachers in the academy, labelled for the picker. */
async function loadAssignableTeachers(academySlug: string | null, locale: string) {
  if (!academySlug || !isSupabaseConfigured()) return [];

  const academy = await getAcademyBySlug(academySlug);
  if (!academy) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachers")
    .select("*")
    .eq("academy_id", academy.id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("assignable teachers load failed", error);
    return [];
  }

  return (data ?? []).map((teacher) => ({
    id: teacher.id,
    label: getTeacherDisplayLabel(teacher, academySlug, locale),
  }));
}
