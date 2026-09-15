"use client";

import { useState, useSyncExternalStore } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import teasers from "@/lib/quran/teasers.json";
import { surahByNumber } from "@/lib/quran/surahs";

/**
 * «كمّلي الآية» on the front door — one cue, and a way in.
 *
 * WHAT IT IS FOR. اختبري حفظك is the most valuable thing in this app for a
 * حافظة and the easiest to never open: it is a tab, and a tab is a decision.
 * A cue sitting on the home screen is not a decision — she reads it before she
 * has decided anything, and either the rest of the ayah comes to her or it
 * does not. Both outcomes are a reason to tap.
 *
 * IT IS A REAL QUESTION, NOT A DECORATION. The pool is built by
 * scripts/build-teasers.mjs with the drill's own rules — six words minimum,
 * never an ayah that opens with the البسملة, cue at the first third on a word
 * boundary — so every cue here is one the drill would genuinely ask. It is
 * scoped to جزء عم, because a cue from البقرة stops most students rather than
 * tempting them, and a card nobody can answer is a card everybody learns to
 * skip.
 *
 * THE ANSWER IS NOT HERE. Revealing it would end the thing it exists to start.
 * The card asks, and اختبري حفظك is where answering happens.
 *
 * Picked on the client, never on the server: a random choice rendered on both
 * sides is a hydration mismatch, and a cue baked into a cached page would be
 * the same one for every student until the cache turned over.
 */

type Teaser = { surah: number; ayah: number; cue: string };

const POOL = teasers as Teaser[];

const subscribeNever = () => () => {};
const pickOne = () => Math.floor(Math.random() * POOL.length);

/*
  The first cue, chosen ONCE per page load.

  `useSyncExternalStore` calls its snapshot on every render and compares the
  result with the last one, so a snapshot that rolls a fresh random number
  each time never settles: React re-renders, gets a different cue, re-renders
  again. That is exactly what happened — the home screen died with "Maximum
  update depth exceeded" once there was a second store on the page to keep
  provoking it. The pick has to be a value that is read, not computed.
*/
let firstPick: number | null = null;
const getFirstPick = () => (firstPick ??= pickOne());

export function AyahTeaser({ academySlug }: { academySlug: string }) {
  const t = useTranslations("home.teaser");

  // The first one is chosen as the client renders; «غيّريها» takes over after.
  const initial = useSyncExternalStore<number | null>(
    subscribeNever,
    getFirstPick,
    () => null,
  );
  const [swapped, setSwapped] = useState<number | null>(null);
  const at = swapped ?? initial;

  if (at === null) return null;

  const teaser = POOL[at];
  const surah = surahByNumber(teaser.surah);

  return (
    <section className="card gap-0 overflow-hidden border-accent-300 bg-accent-100/30 p-0 dark:border-accent-700 dark:bg-accent-700/10">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-accent-700 dark:text-accent-300">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {t("label")}
        </h2>
        <button
          type="button"
          onClick={() => {
            // A different one, never the same one twice in a row — re-rolling
            // and getting the same cue reads as a broken button.
            let next = pickOne();
            while (POOL.length > 1 && next === at) next = pickOne();
            setSwapped(next);
          }}
          aria-label={t("another")}
          title={t("another")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                     text-muted-foreground transition-colors hover:text-accent-700
                     dark:hover:text-accent-300"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p
        dir="rtl"
        lang="ar"
        className="px-4 pb-1 pt-2 text-center text-[1.15rem] leading-[2.1]"
      >
        {teaser.cue}
        {/* The ellipsis is the question. It is muted and outside the ayah's
            own styling, so nothing suggests it is part of the text. */}
        <span className="text-muted-foreground"> …</span>
      </p>

      <p className="pb-3 text-center text-xs text-muted-foreground">
        {surah ? t("from", { surah: surah.name }) : ""}
      </p>

      <Link
        href={`/${academySlug}/self-test`}
        className="block border-t border-accent-300/70 px-4 py-3 text-center
                   text-sm font-bold text-accent-700 transition-colors
                   hover:bg-accent-100/60 dark:border-accent-700 dark:text-accent-300"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
