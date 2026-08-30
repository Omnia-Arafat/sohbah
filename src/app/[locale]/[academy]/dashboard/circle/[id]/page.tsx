import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyLinkButton } from "@/components/copy-link-button";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { BackLink } from "@/components/back-link";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/server";
import { SessionClient } from "./session-client";

type SessionPageProps = {
  params: Promise<{ locale: string; academy: string; id: string }>;
};

/** Authorized route: never prerender it. See the note in `../../page.tsx`. */
export const dynamic = "force-dynamic";

/**
 * RLS (`circles_select_own_or_admin`) is what enforces ownership here — another
 * teacher's id simply returns no row, which the page turns into a 404.
 */
async function loadCircle(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("circles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("circle load failed", error);
    return null;
  }
  return data;
}

export async function generateMetadata({
  params,
}: SessionPageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "session" });

  if (!isSupabaseConfigured()) return { title: t("title") };

  const circle = await loadCircle(id);
  return { title: circle?.name ?? t("title") };
}

export default async function TeacherSessionPage({ params }: SessionPageProps) {
  const { locale, academy: academySlug, id } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("session");
  const tCircle = await getTranslations("circle");
  const tDashboard = await getTranslations("dashboard");

  const session = await requireTeacherSession(`/${academySlug}/dashboard/circle/${id}`);

  if (!isActiveTeacher(session)) {
    return (
      <TeacherAccountNotice
        reason={session.teacher ? "inactive" : "notLinked"}
        email={session.email}
      />
    );
  }

  const circle = await loadCircle(id);
  if (!circle) notFound();

  const supabase = await createClient();
  const [queueResult, infoResult] = await Promise.all([
    supabase.rpc("circle_queue", { p_slug: circle.registration_slug }),
    // Reused for the session date, which is resolved in the circle's own
    // timezone rather than the server's — a 05:00 Fajr circle depends on it.
    supabase.rpc("circle_public_info", { p_slug: circle.registration_slug }),
  ]);

  if (queueResult.error) console.error("circle_queue failed", queueResult.error);
  if (infoResult.error) console.error("circle_public_info failed", infoResult.error);

  const info = infoResult.data?.[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <BackLink href={`/${academySlug}/dashboard`}>
          {tDashboard("backToDashboard")}
        </BackLink>

        <div className="card mt-2 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-surface">
          <p className="text-sm text-muted-foreground">
            {tCircle(`type.${circle.type}`)} ·{" "}
            {tDashboard(`gender.${circle.gender_category}`)}
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">
            {circle.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tCircle("startsAt", { time: formatTime(circle.start_time, locale) })}
            {" · "}
            <span dir="ltr">{circle.timezone}</span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={circle.session_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary px-4 py-2 text-sm"
            >
              {tCircle("openSession")}
            </a>
            <CopyLinkButton path={`/${locale}/${academySlug}/circle/${circle.registration_slug}`} />
          </div>

          {info && !info.meets_today && (
            <p className="mt-3 text-sm text-accent-700 dark:text-accent-300">
              {t("notToday")}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("queue.title")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("queue.hint")}</p>

        {info ? (
          <SessionClient
            slug={circle.registration_slug}
            circleId={circle.id}
            sessionDate={info.session_date}
            initialQueue={queueResult.data ?? []}
          />
        ) : (
          <p className="card text-muted-foreground">{t("errors.generic")}</p>
        )}
      </section>
    </div>
  );
}
