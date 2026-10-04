"use client";

import { useState } from "react";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SignIn } from "@/app/[locale]/[academy]/me/me-client";
import { HifzCard, MyTrackCard, doneCount, todayOf } from "@/components/student-record";
import { clearMe, setMe } from "@/lib/me-store";
import { useMe, useMyRecord } from "@/lib/use-my-record";

/**
 * «أنا كطالبة» — the student half of someone who is also staff.
 *
 * A معلمة, مشرفة or admin is often a student too: on a track, with a حفظ of
 * her own. Signed in as staff she was sent to the dashboard and never saw
 * any of it, and the only way to her ورد was to sign out.
 *
 * Her student side is her real student record — the one she registered with
 * and was enrolled on — so she names it once with her name and phone, here,
 * and this browser remembers it. It is not guessed from the staff account:
 * the row staff_student_record() makes for taking a turn is a different row,
 * and households share numbers.
 */
export function StaffStudentSide({
  academySlug,
  show,
}: {
  academySlug: string;
  /** "linked" renders only once her student side is known; "unlinked" only before. */
  show: "linked" | "unlinked";
}) {
  const t = useTranslations("studentHome.staffSide");
  const { key, me } = useMe(academySlug);
  const [open, setOpen] = useState(false);

  if ((show === "linked") !== Boolean(me)) return null;

  if (!me) {
    return (
      <section className="card flex flex-col gap-3 border-dashed">
        <div className="flex items-center gap-3">
          <GraduationCap aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="min-w-0 flex-grow">
            <h2 className="font-bold">{t("title")}</h2>
            <p className="text-xs text-muted-foreground">{t("prompt")}</p>
          </div>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="btn-secondary min-h-10 shrink-0 px-3 text-sm">
              {t("link")}
            </button>
          )}
        </div>
        {open && <SignIn bare academySlug={academySlug} onFound={(found) => setMe(key, found)} />}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t border-dashed border-brand-200 pt-4 dark:border-brand-800">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">{t("title")}</h2>
        <button
          type="button"
          onClick={() => clearMe(key)}
          className="min-h-10 text-xs font-semibold text-muted-foreground underline"
        >
          {t("notMe", { name: me.name.trim().split(/\s+/)[0] ?? "" })}
        </button>
      </div>
      <MyTrackCard academySlug={academySlug} />
      <HifzCard academySlug={academySlug} />
    </section>
  );
}

/**
 * The one line above the admin tracks list for someone who is on a track
 * herself: managing every مسار and doing her own ورد are two different jobs,
 * and this is the door from the first to the second.
 */
export function TrackSelfBanner({ academySlug }: { academySlug: string }) {
  const t = useTranslations("studentHome.staffSide");
  const tTrack = useTranslations("studentHome.track");
  const { data } = useMyRecord(academySlug);
  const days = data?.trackDays ?? [];
  if (days.length === 0) return null;

  const today = todayOf(days);
  const finished = Boolean(today?.recited_new && today?.recited_review);

  return (
    <Link
      href={`/${academySlug}/me/track`}
      prefetch={false}
      className="flex items-center gap-3 rounded-2xl bg-brand-900 px-4 py-3 text-white"
    >
      <span className="flex min-w-0 flex-grow flex-col">
        <span className="truncate text-xs text-brand-200">{t("bannerOn", { track: days[0].track_name })}</span>
        <span className="text-sm font-bold">
          {finished ? tTrack("todayDone") : tTrack("today", { done: doneCount(today) })}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-brand-900">
        {t("openWird")}
        <ChevronLeft aria-hidden="true" className="h-4 w-4 ltr:rotate-180" />
      </span>
    </Link>
  );
}
