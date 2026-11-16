"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, X, Minus, Users, Check } from "lucide-react";
import { SURAHS, surahByNumber } from "@/lib/quran/surahs";
import {
  DAY_LEAF,
  WEEKDAYS,
  arNum,
  rangeText,
  type ScheduleDay,
} from "@/lib/schedule-format";
import { SchedulePrintPicker, type PickerSheet } from "@/components/schedule-print-picker";
import { applySchedule, type ApplyTarget } from "../actions";

type Cohort = { id: string; name: string };
type Track = { id: string; name: string; durationWeeks: number; cohorts: Cohort[] };

const DAY_SHORT = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس"];

const ERRORS: Record<string, string> = {
  notAuthorized: "الحفظ للمشرفات والإدارة فقط.",
  notFound: "المسار أو الدفعة مش موجودين.",
  noTargets: "اختاري مسار أو دفعة واحدة على الأقل.",
  weekRange: "رقم الأسبوع أكبر من مدة المسار.",
  saveFailed: "ماتحفظش، جربي تاني.",
};

function errorText(code: string): string {
  const [kind, idx] = code.split(":");
  const day = idx !== undefined ? (Number(idx) === 0 ? "لقاء المعلمة" : Number(idx) === 6 ? "الجمعة" : `اليوم ${DAY_SHORT[Number(idx)]}`) : "";
  if (kind === "incomplete") return `${day}: كمّلي السورة والآيات أو امسحيهم.`;
  if (kind === "ayah") return `${day}: رقم الآية أكبر من عدد آيات السورة.`;
  if (kind === "backwards") return `${day}: النهاية قبل البداية.`;
  if (kind === "surah") return `${day}: السورة مش صحيحة.`;
  return ERRORS[kind] ?? "حصل خطأ.";
}

export function BuilderClient({
  academySlug,
  tracks,
  initialDays,
  initialTitle,
  initialMeetingWeekday,
  initialMeetingTime,
  initialPublished,
  initialTargets,
  defaultSurah,
}: {
  academySlug: string;
  tracks: Track[];
  initialDays: ScheduleDay[];
  initialTitle: string;
  initialMeetingWeekday: number | null;
  initialMeetingTime: string;
  initialPublished: boolean;
  initialTargets: ApplyTarget[];
  defaultSurah: number;
}) {
  const [days, setDays] = useState<ScheduleDay[]>(initialDays);
  const [title, setTitle] = useState(initialTitle);
  const [weekday, setWeekday] = useState<number | null>(initialMeetingWeekday);
  const [time, setTime] = useState(initialMeetingTime);
  const [publish, setPublish] = useState(initialPublished);
  const [targets, setTargets] = useState<ApplyTarget[]>(initialTargets);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const [weekSurah, setWeekSurah] = useState<number>(
    () => initialDays.find((d) => d.dayIndex >= 1 && d.dayIndex <= 5 && d.fromSurah)?.fromSurah ?? defaultSurah,
  );

  function patchDay(i: number, change: Partial<ScheduleDay>) {
    setSaved(null);
    setDays((prev) => prev.map((d) => (d.dayIndex === i ? { ...d, ...change } : d)));
  }

  function setRange(i: number, field: "fromAyah" | "toAyah", raw: string) {
    const n = raw === "" ? null : Number(raw);
    const d = days[i];
    const next = { ...d, [field]: n && n > 0 ? n : null };
    // Both ayahs cleared means "no memorisation this day", so the surah goes too:
    // a surah with no ayahs is a half-entered range the save would refuse.
    if (next.fromAyah === null && next.toAyah === null) {
      patchDay(i, { [field]: null, fromSurah: null, toSurah: null });
      return;
    }
    patchDay(i, {
      [field]: next[field],
      fromSurah: d.fromSurah ?? weekSurah,
      toSurah: d.toSurah ?? d.fromSurah ?? weekSurah,
    });
  }

  function setDaySurah(i: number, n: number) {
    patchDay(i, { fromSurah: n, toSurah: n });
  }

  /** Moves every day that was on the old week surah to the new one. */
  function setWeekSurahAll(n: number) {
    setSaved(null);
    const old = weekSurah;
    setWeekSurah(n);
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex <= 5 && d.fromSurah === old && d.toSurah === old ? { ...d, fromSurah: n, toSurah: n } : d,
      ),
    );
  }

  function patchTarget(i: number, change: Partial<ApplyTarget>) {
    setSaved(null);
    setTargets((prev) => prev.map((t, j) => (j === i ? { ...t, ...change } : t)));
  }

  const keys = targets.map((t) => `${t.trackId}.${t.cohort}.${t.week}`);
  const firstWeek = targets[0]?.week ?? 1;
  const canSync = targets.length > 1 && targets.some((t) => t.week !== firstWeek);

  function labelOf(t: ApplyTarget) {
    const track = trackById.get(t.trackId);
    const cohort = t.cohort === "base" ? "كل الدفعات" : track?.cohorts.find((c) => c.id === t.cohort)?.name ?? "";
    return `${track?.name ?? ""} · ${cohort} · الأسبوع ${arNum(t.week)}`;
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await applySchedule({
        academySlug,
        title,
        meetingWeekday: weekday,
        meetingTime: time,
        publish,
        days,
        targets,
      });
      if (res.ok) setSaved(res.sheets);
      else setError(errorText(res.error));
    });
  }

  const sheets: PickerSheet[] = (saved ?? []).map((ref) => {
    const t = targets.find((x) => `${x.trackId}.${x.cohort}.${x.week}` === ref)!;
    return { ref, label: t ? labelOf(t) : ref, base: t?.cohort === "base" };
  });

  const input = "h-11 rounded-xl border-[1.5px] border-lime-200 bg-surface px-3 text-base font-bold";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-[2] flex-col gap-6">
        {/* ١ — the week itself */}
        <section className="card flex flex-col gap-4" aria-labelledby="s1">
          <StepHead n={1} id="s1" title="اكتبي الأسبوع" />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              سورة الأسبوع
              <select
                className={`field-select ${input}`}
                value={weekSurah}
                onChange={(e) => setWeekSurahAll(Number(e.target.value))}
              >
                {SURAHS.map((s) => (
                  <option key={s.number} value={s.number}>
                    {arNum(s.number)} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              عنوان الأسبوع (اختياري)
              <input className={input} value={title} onChange={(e) => { setSaved(null); setTitle(e.target.value); }} placeholder="الربع الأول" />
            </label>
          </div>

          {/* لقاء المعلمة */}
          <div className="flex flex-col gap-3 rounded-2xl bg-maroon-100 p-4">
            <span className="flex items-center gap-2 text-base font-extrabold text-maroon-600">
              <Users className="size-5" aria-hidden="true" />
              لقاء المعلمة
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[11rem_12rem_minmax(0,1fr)]">
              <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-maroon-600">
                يوم اللقاء
                <select
                  className="field-select h-11 w-full rounded-xl border-[1.5px] border-maroon-200 bg-surface font-bold text-maroon-600"
                  value={weekday ?? ""}
                  onChange={(e) => { setSaved(null); setWeekday(e.target.value === "" ? null : Number(e.target.value)); }}
                >
                  <option value="">يوم بداية الدفعة</option>
                  {[6, 0, 1, 2, 3, 4, 5].map((w) => (
                    <option key={w} value={w}>{WEEKDAYS[w]}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-maroon-600">
                الساعة
                <input
                  className="h-11 w-full min-w-0 rounded-xl border-[1.5px] border-maroon-200 bg-surface px-3 font-semibold"
                  value={time}
                  placeholder="٨ م بتوقيت القاهرة"
                  onChange={(e) => { setSaved(null); setTime(e.target.value); }}
                />
              </label>
              <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-bold text-maroon-600 sm:col-span-1">
                ماذا يحدث في اللقاء
                <input
                  className="h-11 rounded-xl border-[1.5px] border-maroon-200 bg-surface px-3 font-semibold"
                  value={days[0].notes}
                  placeholder="تصحيح سورة المائدة الربع الأول"
                  onChange={(e) => patchDay(0, { notes: e.target.value })}
                />
              </label>
            </div>
            <AyahRange day={days[0]} weekSurah={weekSurah} onSurah={(n) => setDaySurah(0, n)} onRange={(f, v) => setRange(0, f, v)} tone="maroon" label="التصحيح من آية" />
          </div>

          {/* الأيام */}
          {days.slice(1, 6).map((d, i) => (
            <div key={d.dayIndex} className="flex flex-col gap-2 rounded-2xl border border-lime-200 bg-brand-50 p-3">
              <div className="flex items-center gap-3">
                <span className="flex flex-none items-center gap-2 font-extrabold text-brand-800">
                  <span
                    className="flex size-7 items-center justify-center rounded-[3px_50%_3px_50%] text-sm font-black"
                    style={{ background: DAY_LEAF[i], color: i >= 3 ? "#fff" : "#1f2a1c" }}
                  >
                    {arNum(i + 1)}
                  </span>
                  {DAY_SHORT[i + 1]}
                </span>
                <span className="ms-auto font-display text-lg font-bold text-brand-700">{rangeText(d)}</span>
              </div>
              <AyahRange day={d} weekSurah={weekSurah} onSurah={(n) => setDaySurah(d.dayIndex, n)} onRange={(f, v) => setRange(d.dayIndex, f, v)} tone="green" label="حفظ من آية" />
              <input
                className="h-10 rounded-xl border border-lime-200 bg-surface px-3 text-sm font-semibold"
                value={d.review}
                placeholder="المراجعة والتثبيت (اختياري)"
                aria-label={`المراجعة: اليوم ${DAY_SHORT[i + 1]}`}
                onChange={(e) => patchDay(d.dayIndex, { review: e.target.value })}
              />
            </div>
          ))}

          <label className="flex flex-col gap-1 rounded-2xl bg-sand-200 p-4 text-xs font-bold text-sand-700">
            الجمعة
            <input
              className="h-11 rounded-xl border-[1.5px] border-sand-200 bg-surface px-3 text-base font-semibold text-foreground"
              value={days[6].notes}
              placeholder="راحة واستدراك"
              onChange={(e) => patchDay(6, { notes: e.target.value })}
            />
          </label>
        </section>

        {/* ٢ — where it applies */}
        <section className="card flex flex-col gap-4" aria-labelledby="s2">
          <StepHead n={2} id="s2" title="يتطبّق على مين؟" />
          <p className="text-sm font-semibold leading-7 text-muted-foreground">
            كل سطر = مسار + دفعة + رقم الأسبوع. <b className="text-brand-700">كل الدفعات</b> يعني جدول المسار
            الأساسي، وكل دفعة تشوفه لما توصل للأسبوع ده. <b className="text-maroon-600">دفعة بعينها</b> يعني نسخة
            خاصة بيها بس.
          </p>

          {targets.map((t, i) => {
            const track = trackById.get(t.trackId);
            const base = t.cohort === "base";
            const dup = keys.indexOf(keys[i]) !== i;
            return (
              <div
                key={i}
                className={`flex flex-col gap-3 rounded-2xl p-4 ${base ? "border-[1.5px] border-lime-500 bg-brand-50" : "border-[1.5px] border-maroon-200 bg-maroon-50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex size-7 items-center justify-center rounded-[3px_50%_3px_50%] text-sm font-black text-white ${base ? "bg-brand-600" : "bg-maroon-600"}`}>
                    {arNum(i + 1)}
                  </span>
                  <span className={`flex-1 text-sm font-extrabold ${base ? "text-brand-700" : "text-maroon-600"}`}>{labelOf(t)}</span>
                  {targets.length > 1 && (
                    <button
                      type="button"
                      aria-label="احذفي السطر"
                      onClick={() => { setSaved(null); setTargets((p) => p.filter((_, j) => j !== i)); }}
                      className="flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-surface text-sand-700"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1.5 text-xs font-extrabold">
                    المسار
                    <select
                      className={`field-select ${input}`}
                      value={t.trackId}
                      onChange={(e) => patchTarget(i, { trackId: e.target.value, cohort: "base" })}
                    >
                      {tracks.map((tr) => (
                        <option key={tr.id} value={tr.id}>{tr.name}</option>
                      ))}
                    </select>
                  </label>
                  <div role="radiogroup" aria-label="الدفعة" className="flex min-w-60 flex-1 flex-col gap-1.5">
                    <span className="text-xs font-extrabold">الدفعة</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[{ id: "base", name: "كل الدفعات" }, ...(track?.cohorts ?? [])].map((c) => {
                        const on = t.cohort === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => patchTarget(i, { cohort: c.id })}
                            className={`min-h-11 rounded-full px-4 text-sm font-extrabold ${
                              on
                                ? c.id === "base" ? "bg-brand-600 text-white" : "bg-maroon-600 text-white"
                                : "border-[1.5px] border-border-subtle bg-surface"
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-extrabold">الأسبوع</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="الأسبوع السابق" onClick={() => patchTarget(i, { week: Math.max(1, t.week - 1) })} className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-lime-200 bg-surface text-brand-700">
                        <Minus className="size-4" aria-hidden="true" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={track?.durationWeeks ?? 40}
                        aria-label="رقم الأسبوع"
                        value={t.week}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1) patchTarget(i, { week: Math.min(n, track?.durationWeeks ?? 40) });
                        }}
                        className="h-11 w-16 rounded-xl bg-lime-100 text-center text-lg font-black text-brand-700"
                      />
                      <button type="button" aria-label="الأسبوع التالي" onClick={() => patchTarget(i, { week: Math.min(track?.durationWeeks ?? 40, t.week + 1) })} className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-lime-200 bg-surface text-brand-700">
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
                {dup && <p className="text-xs font-bold text-sand-700">السطر ده مكرر مع سطر فوقه، هيتحفظ مرة واحدة.</p>}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const last = targets[targets.length - 1] ?? { trackId: tracks[0]?.id ?? "", cohort: "base", week: 1 };
                setSaved(null);
                setTargets((p) => [...p, { trackId: last.trackId, cohort: "base", week: last.week }]);
              }}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-dashed border-lime-500 bg-brand-50 px-4 font-extrabold text-brand-700"
            >
              <Plus className="size-4" aria-hidden="true" />
              أضيفي مسار أو دفعة تانية
            </button>
            {canSync && (
              <button
                type="button"
                onClick={() => { setSaved(null); setTargets((p) => p.map((t) => ({ ...t, week: firstWeek }))); }}
                className="btn-secondary"
              >
                خلّي كل السطور على الأسبوع {arNum(firstWeek)}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ٣ — review, save, print */}
      <aside className="flex min-w-0 flex-1 flex-col gap-4 lg:sticky lg:top-4" aria-labelledby="s3">
        <StepHead n={3} id="s3" title="راجعي وانشري" />

        <div className="card flex flex-col gap-2">
          <span className="text-sm font-extrabold">هيظهر في</span>
          {targets.map((t, i) => (
            keys.indexOf(keys[i]) === i && (
              <div key={i} className={`rounded-xl px-3 py-2 ${t.cohort === "base" ? "bg-lime-100" : "bg-maroon-100"}`}>
                <span className="block text-sm font-extrabold">{labelOf(t)}</span>
                <span className={`text-xs font-bold ${t.cohort === "base" ? "text-brand-700" : "text-maroon-600"}`}>
                  {t.cohort === "base" ? "الجدول الأساسي للمسار" : "نسخة خاصة بالدفعة"}
                </span>
              </div>
            )
          ))}
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 font-bold">
          <input type="checkbox" checked={publish} onChange={(e) => { setSaved(null); setPublish(e.target.checked); }} className="size-5 accent-brand-600" />
          انشريه للطالبات
        </label>

        <button type="button" onClick={save} disabled={pending} className="btn-primary min-h-14 text-lg">
          {pending ? "بيتحفظ…" : publish ? "احفظي وانشري" : "احفظي كمسودة"}
        </button>
        {error && <p role="alert" className="text-sm font-bold text-absent">{error}</p>}

        {saved && (
          <>
            <p role="status" className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
              <Check className="size-5" aria-hidden="true" />
              {publish ? "اتنشر" : "اتحفظ"} في {saved.length === 1 ? "مكان واحد" : `${arNum(saved.length)} أماكن`}.
            </p>
            <SchedulePrintPicker
              academySlug={academySlug}
              sheets={sheets}
              backHref={`/${academySlug}/admin/tracks/schedules`}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function StepHead({ n, id, title }: { n: number; id: string; title: string }) {
  const bg = n === 1 ? "bg-lime-500 text-foreground" : n === 2 ? "bg-brand-500 text-white" : "bg-brand-600 text-white";
  return (
    <div className="flex items-center gap-3">
      <span className={`flex size-9 items-center justify-center rounded-[4px_50%_4px_50%] text-base font-black ${bg}`}>{arNum(n)}</span>
      <h2 id={id} className="text-xl font-extrabold">{title}</h2>
    </div>
  );
}

function AyahRange({
  day,
  weekSurah,
  onSurah,
  onRange,
  tone,
  label,
}: {
  day: ScheduleDay;
  weekSurah: number;
  onSurah: (n: number) => void;
  onRange: (field: "fromAyah" | "toAyah", v: string) => void;
  tone: "green" | "maroon";
  label: string;
}) {
  const surah = day.fromSurah ?? weekSurah;
  const max = surahByNumber(surah)?.ayahs ?? 286;
  const box = tone === "maroon" ? "border-maroon-200" : "border-lime-200";
  const text = tone === "maroon" ? "text-maroon-600" : "text-muted-foreground";
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-[12rem_auto_auto] sm:items-center sm:justify-start">
      <select
        aria-label="السورة"
        value={surah}
        onChange={(e) => onSurah(Number(e.target.value))}
        className={`field-select col-span-2 h-11 w-full rounded-xl border-[1.5px] ${box} bg-surface text-sm font-bold sm:col-span-1`}
      >
        {SURAHS.map((s) => (
          <option key={s.number} value={s.number}>{s.name}</option>
        ))}
      </select>
      <label className={`flex min-w-0 items-center gap-1.5 text-xs font-bold ${text}`}>
        <span className="shrink-0">{label}</span>
        <input type="number" min={1} max={max} value={day.fromAyah ?? ""} onChange={(e) => onRange("fromAyah", e.target.value)} className={`h-11 w-full min-w-0 rounded-xl border-[1.5px] ${box} bg-surface text-center text-base font-black sm:w-16`} />
      </label>
      <label className={`flex min-w-0 items-center gap-1.5 text-xs font-bold ${text}`}>
        <span className="shrink-0">إلى</span>
        <input type="number" min={1} max={max} value={day.toAyah ?? ""} onChange={(e) => onRange("toAyah", e.target.value)} className={`h-11 w-full min-w-0 rounded-xl border-[1.5px] ${box} bg-surface text-center text-base font-black sm:w-16`} />
      </label>
    </div>
  );
}
