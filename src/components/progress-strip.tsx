"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { buildProgress } from "@/lib/quran/progress";
import { createClient } from "@/lib/supabase/client";
import adhkarData from "@/lib/adhkar/morning-evening.json";

/**
 * The strip at the top of the home screen: two slides she swipes between —
 * her حفظ, and today's أذكار.
 *
 * WHAT IT IS FOR. Both numbers already exist in this app and both are two
 * taps away: the جزء map lives in صفحتي behind her name and phone, and the
 * أذكار count lives inside the أذكار screen. Two taps is where progress goes
 * to be forgotten. Here it is the first thing on the page, in the space the
 * welcome block used to take, and it is the whole argument for the strip —
 * seeing «٧ أجزاء» without asking for it is what makes anyone want an eighth.
 *
 * WHY THE أذكار SLIDE CHANGES ITSELF. Morning أذكار are said before the
 * afternoon and evening ones after it; a strip that shows the morning's count
 * at nine at night is showing a task whose time has passed. So the clock
 * picks, and before the switch the slide says «كمّليها قبل ما يدخل المسا» —
 * a nudge while it can still be acted on.
 *
 * AND WHAT IT DELIBERATELY NEVER SAYS: that she missed the morning. Once
 * العصر passes the slide becomes المساء and the morning leaves one quiet line
 * beneath it. A screen that opens by telling a student what she failed to do
 * today is a screen she stops opening.
 *
 * WHY حفظ CAN BE ABSENT. Students have no accounts — her حفظ is readable only
 * with the phone she registered, which lives in this browser once she has
 * opened صفحتي (see me-store.ts). Until then there is no حفظ slide at all and
 * the strip is simply the أذكار: «٠ من ٣٠» shown to a حافظة of seven أجزاء is
 * not a blank state, it is wrong, and a dash in the ring reads as broken. The
 * invitation to open her page already lives on the صفحتك card further down.
 */

type Dhikr = { id: number; count: number; morning: boolean; evening: boolean };
const ADHKAR = adhkarData as Dhikr[];

/** Mirrors the أذكار screen exactly — the same clock and the same keys. */
type Period = "morning" | "evening";
const periodNow = (): Period => (new Date().getHours() < 15 ? "morning" : "evening");

/** The hour the أذكار slide starts asking her to finish before المساء. */
const NUDGE_FROM_HOUR = 12;

function adhkarKey(period: Period): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return `sohbah:adhkar:${day}:${period}`;
}

function readAdhkar(period: Period): Record<number, number> {
  try {
    const raw = window.localStorage.getItem(adhkarKey(period));
    return raw ? (JSON.parse(raw) as Record<number, number>) : {};
  } catch {
    return {};
  }
}

function adhkarDone(period: Period) {
  const tapped = readAdhkar(period);
  const list = ADHKAR.filter((d) => d[period]);
  return {
    done: list.filter((d) => (tapped[d.id] ?? 0) >= d.count).length,
    total: list.length,
  };
}

/** 6236 ayat, so the ring is the share of the mushaf she holds. */
const AYAH_TOTAL = 6236;

const subscribeNever = () => () => {};

/** How long a slide holds before it turns itself, until she touches it. */
const ROTATE_MS = 7000;

export function ProgressStrip({ academySlug }: { academySlug: string }) {
  const t = useTranslations("home.strip");
  const supabase = useMemo(() => createClient(), []);

  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  // The clock and this browser's أذكار count: client-only facts, read the way
  // the rest of this app reads them rather than assigned from an effect.
  const period = useSyncExternalStore<Period | null>(subscribeNever, periodNow, () => null);
  const hour = useSyncExternalStore<number | null>(
    subscribeNever,
    () => new Date().getHours(),
    () => null,
  );
  const adhkar = useSyncExternalStore(
    subscribeNever,
    () => (period ? JSON.stringify(adhkarDone(period)) : "null"),
    () => "null",
  );

  const [hifz, setHifz] = useState<{ juz: number; pages: number; pct: number } | null>(null);
  const [slide, setSlide] = useState(0);
  const [held, setHeld] = useState(false);

  /*
    Her حفظ, once, when this browser knows who she is.

    A failure is silent on purpose: the strip is not the place to report that
    a lookup did not work, and the أذكار slide beside it is unaffected.
  */
  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("my_recitations", {
        p_student_id: me.studentId,
        p_phone: me.phone,
      });
      if (cancelled || error || !data) return;

      const progress = buildProgress(data);
      setHifz({
        juz: progress.totalSpan.juz,
        pages: progress.totalSpan.pages,
        pct: Math.round((progress.totalAyahs / AYAH_TOTAL) * 100),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [me, supabase]);

  /*
    It turns itself until she touches it, and then it is hers.

    Auto-rotation is what she asked for and it is also the only way the second
    slide is ever seen by someone who does not know it is there. But a strip
    that keeps moving under a thumb is a strip nobody can read, so the first
    swipe stops it for good this visit.
  */
  useEffect(() => {
    if (held || hifz === null) return;
    const timer = setInterval(() => setSlide((at) => (at + 1) % 2), ROTATE_MS);
    return () => clearInterval(timer);
  }, [held, hifz]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Anything this far vertical was the page scrolling past, not a swipe.
    if (Math.abs(dy) > 40 || Math.abs(dx) < 45) return;

    setHeld(true);
    setSlide((at) => (at + 1) % 2);
  }

  // Nothing until the clock has been read on the client — a server-rendered
  // guess at the half of the day would flash the wrong slide.
  if (period === null || hour === null) return null;

  const counts = JSON.parse(adhkar) as { done: number; total: number } | null;
  if (!counts) return null;

  const adhkarPct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  const adhkarFinished = counts.total > 0 && counts.done === counts.total;
  const remaining = counts.total - counts.done;

  // The nudge only exists while there is still a morning to finish.
  const nudging = period === "morning" && hour >= NUDGE_FROM_HOUR && !adhkarFinished;

  const morningLeftover =
    period === "evening" ? adhkarDone("morning") : null;

  /*
    The حفظ slide only exists once this browser knows who she is.

    Students have no accounts, so her حفظ is readable only with the phone she
    registered — and until she has opened صفحتي there is nothing true to put
    in that ring. A dash reads as broken and a «٠ من ٣٠» would tell a حافظة of
    seven أجزاء that she has none. So the strip is simply one slide until
    there is a second one worth turning to, and the invitation to open her
    page lives on the صفحتك card further down, where it already is.
  */
  const hasHifz = hifz !== null;
  const showing = hasHifz ? slide : 1;

  return (
    <section
      onTouchStart={hasHifz ? onTouchStart : undefined}
      onTouchEnd={hasHifz ? onTouchEnd : undefined}
      className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-sm"
    >
      {showing === 0 && hifz ? (
        <Slide
          href={`/${academySlug}/me`}
          at={0}
          pages={2}
          ring={{ pct: hifz.pct, track: "stroke-surface-muted", fill: "stroke-brand-600" }}
          // Always a count, never a percentage and never a dash: «٧/٣٠» is
          // the same shape as the أذكار ring beside it and is the number a
          // حافظة actually thinks in.
          label={`${hifz.juz}/30`}
          labelTone="text-brand-700 dark:text-brand-300"
          title={t("hifz.title")}
          side={t("hifz.span", { juz: hifz.juz, pages: hifz.pages })}
          note={t("hifz.note")}
          bar={{ pct: hifz.pct, track: "bg-surface-muted", fill: "bg-brand-600" }}
        />
      ) : (
        <Slide
          href={`/${academySlug}/adhkar`}
          at={1}
          pages={hasHifz ? 2 : 1}
          ring={{
            pct: adhkarPct,
            track: "stroke-accent-100 dark:stroke-accent-700/30",
            fill: "stroke-accent-500",
          }}
          label={`${counts.done}/${counts.total}`}
          labelTone="text-accent-700 dark:text-accent-400"
          title={t(period === "morning" ? "adhkar.morning" : "adhkar.evening")}
          side={
            adhkarFinished
              ? t("adhkar.done")
              : counts.done === 0
                ? t("adhkar.start")
                : t("adhkar.remaining", { count: remaining })
          }
          sideTone={
            nudging
              ? "text-accent-700 dark:text-accent-400 font-semibold"
              : undefined
          }
          note={
            nudging
              ? t("adhkar.beforeEvening")
              : morningLeftover && morningLeftover.done < morningLeftover.total
                ? t("adhkar.morningLeft", {
                    done: morningLeftover.done,
                    total: morningLeftover.total,
                  })
                : t("adhkar.note")
          }
          bar={{
            pct: adhkarPct,
            track: "bg-accent-100 dark:bg-accent-700/25",
            fill: "bg-accent-500",
          }}
        />
      )}
    </section>
  );
}

/**
 * One slide. Identical anatomy either way — the ring, one line, one note, and
 * the hairline bar — because a strip whose two halves are laid out differently
 * reads as two different components taking turns.
 */
function Slide({
  href,
  at,
  pages,
  ring,
  label,
  labelTone,
  title,
  side,
  sideTone,
  note,
  bar,
}: {
  href: string;
  at: 0 | 1;
  /** 1 hides the dots — there is nowhere to swipe to. */
  pages: 1 | 2;
  ring: { pct: number; track: string; fill: string };
  label: string;
  labelTone: string;
  title: string;
  side: string;
  sideTone?: string;
  note: string;
  bar: { pct: number; track: string; fill: string };
}) {
  // r=19 on a 44px box: circumference 119.4, and the dash offset is the part
  // left empty.
  const CIRCUMFERENCE = 119.4;

  return (
    <>
      <Link href={href} className="flex items-center gap-3 px-3.5 py-3">
        <span className="relative h-11 w-11 shrink-0">
          <svg
            viewBox="0 0 44 44"
            className="block h-11 w-11 -rotate-90"
            aria-hidden="true"
          >
            <circle cx="22" cy="22" r="19" fill="none" strokeWidth="5" className={ring.track} />
            <circle
              cx="22"
              cy="22"
              r="19"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, ring.pct / 100))}
              className={`${ring.fill} transition-[stroke-dashoffset] duration-500`}
            />
          </svg>
          {/* 10px, not 11: «18/24» is five characters inside a 34px opening
              and was touching the ring at the larger size. */}
          <span
            className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums ${labelTone}`}
          >
            {label}
          </span>
        </span>

        <span className="flex min-w-0 flex-grow flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold">{title}</span>
            <span className={`shrink-0 text-[11px] text-muted-foreground ${sideTone ?? ""}`}>
              {side}
            </span>
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{note}</span>
        </span>

        {/* Two dots, stacked: the strip is short and a horizontal pair would
            sit under the note rather than beside it. Hidden entirely when
            there is only one slide — a pager for one page is furniture. */}
        {pages === 2 && (
          <span aria-hidden="true" className="flex shrink-0 flex-col gap-1">
            <span
              className={`h-[5px] w-[5px] rounded-full ${at === 0 ? "bg-brand-600" : "bg-border-subtle"}`}
            />
            <span
              className={`h-[5px] w-[5px] rounded-full ${at === 1 ? "bg-accent-500" : "bg-border-subtle"}`}
            />
          </span>
        )}
      </Link>

      <div className={`h-[3px] ${bar.track}`}>
        <div
          className={`h-full ${bar.fill} transition-[width] duration-500`}
          style={{ width: `${Math.min(100, bar.pct)}%` }}
        />
      </div>
    </>
  );
}
