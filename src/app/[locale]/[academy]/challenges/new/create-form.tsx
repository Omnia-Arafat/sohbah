"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { DhikrBadge } from "@/components/dhikr-badge";
import { useRouter } from "@/i18n/navigation";
import { FAMILIES, FAMILY_NAMES, PRESETS, type Family, type Period } from "@/lib/dhikr";
import { formatCount } from "@/lib/friday";
import { createClient } from "@/lib/supabase/client";

const GOALS = [33, 100, 300, 1000];

/**
 * A new challenge in one screen, top to bottom: the ذكر, how many, how
 * often, for whom, and its badge.
 *
 * Picking a ذكر from the list fills its hadith and source and picks its badge;
 * she can still change the badge, and once she has, choosing another ذكر no
 * longer overrides it. Her own ذكر needs its SOURCE before the button works —
 * nothing is published here without saying who narrated it.
 */
export function CreateForm({
  academySlug,
  locale,
  circles,
}: {
  academySlug: string;
  locale: string;
  circles: { id: string; name: string }[];
}) {
  const t = useTranslations("challenges");
  const tc = useTranslations("challenges.create");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [pick, setPick] = useState<Family | "custom">("tree");
  const [family, setFamily] = useState<Family>("tree");
  const [familyTouched, setFamilyTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [dhikr, setDhikr] = useState("");
  const [virtue, setVirtue] = useState("");
  const [source, setSource] = useState("");
  const [goal, setGoal] = useState(100);
  const [otherGoal, setOtherGoal] = useState("");
  const [period, setPeriod] = useState<Period>("day");
  const [audience, setAudience] = useState<"all" | "circle">("all");
  const [circleId, setCircleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = pick === "custom" ? undefined : PRESETS.find((p) => p.id === pick);
  const finalGoal = otherGoal ? Number(otherGoal) : goal;
  const ready =
    (preset || (title.trim() && dhikr.trim() && source.trim().length >= 3)) &&
    finalGoal >= 1 &&
    (audience === "all" || circleId);

  function choose(id: Family | "custom") {
    setPick(id);
    if (id !== "custom" && !familyTouched) setFamily(id);
  }

  async function publish() {
    if (!ready) {
      setError(tc("missing"));
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("dhikr_challenge_create", {
      p_preset: preset?.id ?? null,
      p_title: preset ? preset.title : title,
      p_dhikr: preset ? preset.dhikr : dhikr,
      p_virtue: preset ? preset.virtue : virtue,
      p_source: preset ? preset.source : source,
      p_family: family,
      p_goal: finalGoal,
      p_period: period,
      p_circle_id: audience === "circle" ? circleId : null,
    });
    if (rpcError || !data) {
      console.error("dhikr_challenge_create failed", rpcError);
      setError(tc("failed"));
      setBusy(false);
      return;
    }
    router.push(`/${academySlug}/challenges/${data}/manage`);
  }

  const chip = (on: boolean) =>
    `min-h-10 rounded-full border px-3 text-xs font-bold transition-colors ${
      on
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-border-subtle bg-surface text-brand-700 dark:text-brand-300"
    }`;
  const seg = (on: boolean) =>
    `h-10 rounded-lg text-xs font-bold ${on ? "bg-surface text-brand-700 shadow-sm dark:text-brand-300" : "text-muted-foreground"}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <BackLink href={`/${academySlug}/challenges`}>{t("back")}</BackLink>
      <h1 className="font-display text-2xl font-bold">{tc("title")}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">{tc("dhikr")}</h2>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => choose(p.id)} className={chip(pick === p.id)}>
              {p.title}
            </button>
          ))}
          <button type="button" onClick={() => choose("custom")} className={chip(pick === "custom")}>
            {tc("custom")}
          </button>
        </div>
      </section>

      {preset ? (
        <section className="card flex flex-col gap-2 p-4">
          <p className="font-display text-lg leading-relaxed text-brand-800 dark:text-brand-200">{preset.dhikr}</p>
          <p className="text-xs leading-loose text-foreground/80">{preset.virtue}</p>
          <p className="text-[11px] text-muted-foreground">{preset.source}</p>
        </section>
      ) : (
        <section className="card flex flex-col gap-3 p-4">
          <label className="block">
            <span className="field-label">{tc("customTitle")}</span>
            <input className="input text-start" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={tc("customTitlePh")} />
          </label>
          <label className="block">
            <span className="field-label">{tc("customDhikr")}</span>
            <textarea className="input text-start font-display text-lg" rows={2} value={dhikr} maxLength={400} onChange={(e) => setDhikr(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">{tc("customVirtue")}</span>
            <textarea className="input text-start" rows={3} value={virtue} maxLength={600} onChange={(e) => setVirtue(e.target.value)} placeholder={tc("customVirtuePh")} />
          </label>
          <label className="block">
            <span className="field-label">
              {tc("customSource")} <span className="text-absent">{tc("required")}</span>
            </span>
            <input className="input text-start" value={source} maxLength={200} required onChange={(e) => setSource(e.target.value)} placeholder={tc("customSourcePh")} />
          </label>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">{tc("goal")}</h2>
        <div className="grid grid-cols-5 gap-1.5">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGoal(g);
                setOtherGoal("");
              }}
              className={`h-11 rounded-xl border text-sm font-bold ${
                !otherGoal && goal === g
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-border-subtle bg-surface text-brand-700 dark:text-brand-300"
              }`}
            >
              {formatCount(g, locale)}
            </button>
          ))}
          <input
            aria-label={tc("otherGoal")}
            placeholder={tc("otherGoal")}
            inputMode="numeric"
            className="input h-11 px-2 text-center text-sm"
            value={otherGoal}
            onChange={(e) => setOtherGoal(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">{tc("period")}</h2>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-muted p-1">
          {(["day", "week", "once"] as Period[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={seg(period === p)}>
              {p === "day" ? t("everyDay") : p === "week" ? t("everyWeek") : t("everyOnce")}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">{tc("audience")}</h2>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
          <button type="button" onClick={() => setAudience("all")} className={seg(audience === "all")}>
            {tc("all")}
          </button>
          <button type="button" onClick={() => setAudience("circle")} className={seg(audience === "circle")}>
            {tc("circle")}
          </button>
        </div>
        {audience === "circle" && (
          <select className="input text-start" value={circleId} onChange={(e) => setCircleId(e.target.value)} aria-label={tc("pickCircle")}>
            <option value="">{tc("pickCircle")}</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">{tc("badge")}</h2>
          <span className="text-[11px] text-muted-foreground">
            {familyTouched || pick === "custom" ? tc("badgeMine") : tc("badgeAuto")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FAMILIES.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={family === f}
              onClick={() => {
                setFamily(f);
                setFamilyTouched(true);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 bg-surface px-1 py-2 ${
                family === f ? "border-brand-600" : "border-border-subtle"
              }`}
            >
              <DhikrBadge family={f} stage={4} size={46} />
              <span className="text-[11px]">{FAMILY_NAMES[f]}</span>
            </button>
          ))}
        </div>
      </section>

      {error && <p className="text-center text-sm text-absent">{error}</p>}

      <button type="button" onClick={publish} disabled={busy} className="btn-primary w-full">
        {busy ? tc("publishing") : tc("publish")}
      </button>
    </div>
  );
}
