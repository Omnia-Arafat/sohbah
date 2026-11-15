"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Printer, Copy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  DAY_LEAF,
  arNum,
  encodeSheet,
  hasRange,
  meetingLine,
  rangeText,
  surahName,
  weekHasContent,
  weekSurah,
  type ScheduleWeek,
} from "@/lib/schedule-format";

type Cohort = { id: string; name: string; startDate: string; currentWeek: number | null };
type Track = { id: string; name: string; durationWeeks: number; cohorts: Cohort[] };

/**
 * Pick a track, then whose eyes to look through (the track's own schedule or
 * one cohort's, where its own copies win), then a week: one focused week
 * plus a grid of all of them to jump with (never a 40-row list).
 */
export function LibraryClient({
  academySlug,
  tracks,
  weeks,
  initial,
}: {
  academySlug: string;
  tracks: Track[];
  weeks: ScheduleWeek[];
  initial: { track: string | null; cohort: string | null; week: number | null };
}) {
  const startTrack = tracks.find((t) => t.id === initial.track) ?? tracks[0];
  const [trackId, setTrackId] = useState(startTrack.id);
  const [view, setView] = useState<string>(
    startTrack.cohorts.some((c) => c.id === initial.cohort) ? initial.cohort! : "base",
  );
  const track = tracks.find((t) => t.id === trackId)!;
  const viewCohort = track.cohorts.find((c) => c.id === view) ?? null;
  const [week, setWeek] = useState<number>(
    initial.week ?? viewCohort?.currentWeek ?? track.cohorts.find((c) => c.currentWeek)?.currentWeek ?? 1,
  );

  const index = useMemo(() => {
    const m = new Map<string, ScheduleWeek>();
    for (const w of weeks) m.set(`${w.trackId}.${w.cohortId ?? "base"}.${w.weekNumber}`, w);
    return m;
  }, [weeks]);

  function effective(n: number): { week: ScheduleWeek; own: boolean } | null {
    if (view !== "base") {
      const own = index.get(`${trackId}.${view}.${n}`);
      if (own) return { week: own, own: true };
    }
    const base = index.get(`${trackId}.base.${n}`);
    return base ? { week: base, own: false } : null;
  }

  function countReady(t: Track) {
    let base = 0;
    let own = 0;
    for (const w of weeks) {
      if (w.trackId !== t.id || !w.isPublished || !weekHasContent(w.days)) continue;
      if (w.cohortId) own++;
      else base++;
    }
    return { base, own };
  }

  const cur = effective(week);
  const filled = cur && weekHasContent(cur.week.days) ? cur : null;
  const cohortParam = view === "base" ? "base" : view;
  // Editing a week a cohort only inherits edits the track's own week; a new
  // copy for the cohort is one choice away inside the builder.
  const editCohort = filled && !filled.own ? "base" : cohortParam;
  const editHref = `/${academySlug}/admin/tracks/schedules/new?track=${trackId}&cohort=${editCohort}&week=${week}`;
  const printHref = `/${academySlug}/print/schedule?s=${encodeSheet({ trackId, cohort: cohortParam, week })}&back=${encodeURIComponent(`/${academySlug}/admin/tracks/schedules?track=${trackId}&cohort=${cohortParam}&week=${week}`)}`;

  let ready = 0;
  const cells = Array.from({ length: track.durationWeeks }, (_, i) => {
    const n = i + 1;
    const e = effective(n);
    const full = e && weekHasContent(e.week.days);
    const state = !full ? "none" : e.own ? "own" : e.week.isPublished ? "published" : "draft";
    if (full && e.week.isPublished) ready++;
    return { n, state };
  });

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="المسارات" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {tracks.map((t) => {
          const on = t.id === trackId;
          const c = countReady(t);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setTrackId(t.id);
                setView("base");
                setWeek(t.cohorts.find((x) => x.currentWeek)?.currentWeek ?? 1);
              }}
              className={`flex min-h-20 flex-col gap-1 rounded-2xl px-4 py-3 text-start ${
                on ? "bg-brand-600 text-white" : "border-[1.5px] border-border-subtle bg-surface"
              }`}
            >
              <span className="text-base font-black">{t.name}</span>
              <span className={`text-xs font-bold ${on ? "text-lime-100" : "text-muted-foreground"}`}>
                {arNum(c.base)} أسبوع أساسي{c.own ? ` · ${arNum(c.own)} خاص` : ""}
              </span>
              <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded ${
                      c.base / t.durationWeeks > i / 10 ? (on ? "bg-lime-300" : "bg-lime-500") : on ? "bg-white/25" : "bg-surface-muted"
                    }`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </nav>

      <section aria-label="اعرضي الجدول كما تراه" className="flex flex-col gap-2">
        <span className="text-sm font-extrabold text-muted-foreground">اعرضي الجدول كما تراه</span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[{ id: "base", name: "الجدول الأساسي", sub: "اللي كل الدفعات بتاخده" }, ...track.cohorts.map((c) => {
            const own = weeks.filter((w) => w.cohortId === c.id && weekHasContent(w.days)).length;
            return {
              id: c.id,
              name: c.name,
              sub: `${c.currentWeek ? `في الأسبوع ${arNum(c.currentWeek)}` : "لم تبدأ"}${own ? ` · ${arNum(own)} أسبوع خاص` : ""}`,
            };
          })].map((v) => {
            const on = v.id === view;
            const base = v.id === "base";
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setView(v.id);
                  const c = track.cohorts.find((x) => x.id === v.id);
                  if (c?.currentWeek) setWeek(c.currentWeek);
                }}
                className={`flex min-h-14 items-center gap-2.5 rounded-2xl px-4 py-2 text-start ${
                  on
                    ? base ? "border-2 border-brand-500 bg-lime-100" : "border-2 border-maroon-600 bg-maroon-100"
                    : "border-[1.5px] border-border-subtle bg-surface"
                }`}
              >
                <span aria-hidden="true" className={`h-[18px] w-3.5 flex-none rounded-[3px_50%_3px_50%] ${base ? "bg-brand-500" : "bg-maroon-600"}`} />
                <span className="flex flex-col">
                  <span className="text-sm font-extrabold">{v.name}</span>
                  <span className="text-xs font-bold text-muted-foreground">{v.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section aria-labelledby="wk" className="card flex min-w-0 flex-[2] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" aria-label="الأسبوع السابق" disabled={week <= 1} onClick={() => setWeek(week - 1)} className="flex size-12 items-center justify-center rounded-xl border-[1.5px] border-lime-200 text-brand-700 disabled:opacity-40">
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <div className="flex min-w-40 flex-1 flex-col">
              <span className="text-xs font-bold text-muted-foreground">
                {track.name} · {viewCohort?.name ?? "الجدول الأساسي"}
              </span>
              <h2 id="wk" className="text-2xl font-black">
                الأسبوع {arNum(week)} <span className="text-sm font-bold text-muted-foreground">من {arNum(track.durationWeeks)}</span>
              </h2>
            </div>
            <span
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
                !filled ? "bg-surface-muted text-muted-foreground" : filled.own ? "bg-maroon-100 text-maroon-600" : filled.week.isPublished ? "bg-lime-100 text-brand-700" : "border-2 border-lime-500 text-brand-700"
              }`}
            >
              {!filled ? "فاضي" : filled.own ? "نسخة خاصة بالدفعة" : filled.week.isPublished ? "من الجدول الأساسي" : "مسودة"}
            </span>
            <button type="button" aria-label="الأسبوع التالي" disabled={week >= track.durationWeeks} onClick={() => setWeek(week + 1)} className="flex size-12 items-center justify-center rounded-xl border-[1.5px] border-lime-200 text-brand-700 disabled:opacity-40">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          </div>

          {filled ? (
            <WeekPreview week={filled.week} startDate={viewCohort?.startDate ?? null} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-lime-200 px-5 py-10 text-center">
              <span className="text-lg font-extrabold">لسه مفيش جدول للأسبوع {arNum(week)}</span>
              <span className="text-sm font-semibold text-muted-foreground">
                {view === "base" ? "لو الدفعات هتشترك فيه، أضيفيه للجدول الأساسي." : "الدفعة دي هتاخد الأساسي لما يتضاف، أو أضيفي نسخة خاصة بيها."}
              </span>
              <Link href={editHref} className="btn-primary">أضيفي جدول الأسبوع {arNum(week)}</Link>
            </div>
          )}

          {filled && (
            <div className="flex flex-wrap gap-2.5">
              <Link href={editHref} className="btn-primary">
                <Pencil className="size-4" aria-hidden="true" />
                تعديل
              </Link>
              <Link href={printHref} className="btn-secondary">
                <Printer className="size-4" aria-hidden="true" />
                اطبعي أو نزّلي
              </Link>
              <Link href={editHref} className="btn-secondary">
                <Copy className="size-4" aria-hidden="true" />
                طبّقيه على مسار أو دفعة تانية
              </Link>
            </div>
          )}
        </section>

        <aside aria-labelledby="grid" className="card flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="grid" className="text-lg font-black">كل الأسابيع</h2>
            <span className="rounded-full bg-lime-100 px-2.5 py-0.5 text-xs font-extrabold text-brand-700">{arNum(ready)} جاهز</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {cells.map((c) => {
              const look =
                c.state === "own" ? "bg-maroon-600 text-white"
                : c.state === "published" ? "bg-brand-500 text-white"
                : c.state === "draft" ? "border-2 border-lime-500 bg-surface text-brand-700"
                : "border-[1.5px] border-dashed border-border-subtle text-muted-foreground";
              return (
                <button
                  key={c.n}
                  type="button"
                  aria-label={`الأسبوع ${arNum(c.n)}`}
                  aria-current={c.n === week}
                  onClick={() => setWeek(c.n)}
                  className={`h-10 rounded-lg text-sm font-extrabold ${look} ${c.n === week ? "outline-[3px] outline-offset-2 outline-foreground" : ""}`}
                >
                  {arNum(c.n)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-bold text-muted-foreground">
            <Legend className="bg-brand-500" label="منشور (أساسي)" />
            <Legend className="bg-maroon-600" label="خاص بالدفعة" />
            <Legend className="border-2 border-lime-500" label="مسودة" />
            <Legend className="border border-dashed border-border-subtle" label="لسه مفيش" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3.5 rounded ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function WeekPreview({ week, startDate }: { week: ScheduleWeek; startDate: string | null }) {
  const surah = weekSurah(week.days);
  const meeting = week.days[0];
  const when = meetingLine(week, startDate);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        {surah !== null && <span className="font-display text-3xl font-bold text-brand-600">سورة {surahName(surah)}</span>}
        {week.title && <span className="text-sm font-bold text-muted-foreground">{week.title}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-maroon-600 px-4 py-3 text-white">
        <span className="font-black">لقاء المعلمة</span>
        {when && <span className="rounded-full bg-lime-500 px-2.5 text-sm font-extrabold text-foreground">{when}</span>}
        <span className="flex-1 font-semibold text-maroon-100">
          {meeting.notes} {hasRange(meeting) && <span className="font-display">{rangeText(meeting)}</span>}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {week.days.slice(1, 6).map((d, i) => (
          <div key={d.dayIndex} className="flex items-center gap-2.5 rounded-xl border border-lime-200 bg-brand-50 px-3 py-2.5">
            <span
              className="flex size-6.5 flex-none items-center justify-center rounded-[3px_50%_3px_50%] text-xs font-black"
              style={{ background: DAY_LEAF[i], color: i >= 3 ? "#fff" : "#1f2a1c" }}
            >
              {arNum(i + 1)}
            </span>
            <span className="flex-1 text-sm font-bold">
              {hasRange(d) ? `حفظ سورة ${surahName(d.fromSurah)}` : d.review || "—"}
            </span>
            <span className="font-display text-base font-bold text-brand-700">{rangeText(d)}</span>
          </div>
        ))}
        <div className="flex items-center rounded-xl bg-sand-200 px-3 py-2.5 text-sm font-extrabold text-sand-700">
          الجمعة · {week.days[6].notes || "راحة واستدراك"}
        </div>
      </div>
    </div>
  );
}
