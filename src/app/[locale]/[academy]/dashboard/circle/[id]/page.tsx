import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pencil } from "lucide-react";
import { canEditAnyCircle } from "@/lib/auth/roles";
import { Link } from "@/i18n/navigation";
import { CopyLinkButton } from "@/components/copy-link-button";
import { TeacherAccountNotice } from "@/components/teacher-account-notice";
import { BackLink } from "@/components/back-link";
import { isActiveTeacher, requireTeacherSession } from "@/lib/auth/dal";
import { circleTypeLabel, loadCircleTypes } from "@/lib/circle-types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatTime } from "@/lib/format-time";
import { createClient } from "@/lib/supabase/server";
import { LessonCard } from "@/components/lesson-card";
import { loadCurricula, loadUnits } from "@/lib/curricula";
import { SessionClient } from "./session-client";
import { LessonPicker } from "./lesson-picker";

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
  const tLesson = await getTranslations("session.lesson");

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
  const [queueResult, infoResult, circleTypes] = await Promise.all([
    supabase.rpc("circle_queue", { p_slug: circle.registration_slug }),
    // Reused for the session date, which is resolved in the circle's own
    // timezone rather than the server's — a 05:00 Fajr circle depends on it.
    supabase.rpc("circle_public_info", { p_slug: circle.registration_slug }),
    // `activeOnly: false` — this circle's own type must still show a real
    // label even if a supervisor has since deactivated it.
    loadCircleTypes(supabase, circle.academy_id, { activeOnly: false }),
  ]);

  // The lesson layer: which curricula this circle's *type* offers, the units
  // under them, and what was already set for today. The unit lists are fetched
  // together rather than one request per curriculum — a حلقة حديث following
  // two books at once is ordinary, and this page is opened at the start of
  // every session.
  const curricula = await loadCurricula(supabase, circle.academy_id, {
    circleType: circle.type,
  });

  const unitLists = await Promise.all(
    curricula.map((curriculum) =>
      loadUnits(supabase, curriculum.id, { activeOnly: true }),
    ),
  );
  const unitsByCurriculum = Object.fromEntries(
    curricula.map((curriculum, index) => [curriculum.id, unitLists[index]]),
  );

  // Read back through the same RPC the student's page uses, so what the معلمة
  // sees in the card above the picker is literally what the students see.
  const sessionDate = infoResult.data?.[0]?.session_date ?? null;
  const [{ data: todayRow }, { data: lessonRows }] = await Promise.all([
    sessionDate
      ? supabase
          .from("circle_sessions")
          .select("*")
          .eq("circle_id", circle.id)
          .eq("session_date", sessionDate)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("circle_lesson", { p_slug: circle.registration_slug }),
  ]);
  const lesson = lessonRows?.[0] ?? null;

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
          {/* Top line of the card: what this circle is, and the way to change
              it, kept out of the way of the name below. */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {circleTypeLabel(circleTypes, circle.type, locale)} ·{" "}
              {tDashboard(`gender.${circle.gender_category}`)}
            </p>
            {(canEditAnyCircle(session.teacher) ||
              circle.teacher_id === session.teacher.id) && (
              <Link
                href={`/${academySlug}/admin/circles/${circle.id}/edit`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border
                           border-border-subtle bg-surface px-3 py-1.5 text-sm font-medium
                           text-muted-foreground transition-colors hover:border-brand-600
                           hover:text-brand-700 dark:hover:text-brand-300"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {tCircle("edit")}
              </Link>
            )}
          </div>

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

      {lesson && <LessonCard lesson={lesson} locale={locale} />}

      <section className="card">
        <h2 className="text-lg font-semibold">{tLesson("title")}</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">{tLesson("hint")}</p>

        {/*
          A circle whose type has no curriculum yet gets the way to make one
          rather than an empty dropdown — this is the first screen a معلمة
          reaches it from, and she is the one allowed to create it.
        */}
        {curricula.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tLesson("noCurriculum")}{" "}
            <Link
              href={`/${academySlug}/admin/curricula`}
              className="font-medium text-brand-700 underline dark:text-brand-300"
            >
              {tLesson("noCurriculumCta")}
            </Link>
          </p>
        ) : (
          <LessonPicker
            academySlug={academySlug}
            circleId={circle.id}
            curricula={curricula}
            unitsByCurriculum={unitsByCurriculum}
            currentUnitId={todayRow?.unit_id ?? null}
            currentNote={todayRow?.note ?? null}
          />
        )}
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
            maxStudents={circle.max_students}
          />
        ) : (
          <p className="card text-muted-foreground">{t("errors.generic")}</p>
        )}
      </section>
    </div>
  );
}
