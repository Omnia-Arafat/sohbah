"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { createClient } from "@/lib/supabase/client";

type Day = {
  session_date: string;
  is_today: boolean;
  recited_new: boolean;
  recited_review: boolean;
  heard_recitation: boolean;
  prayed_with_memorised: boolean;
  partner_name: string | null;
  track_name: string;
  week_number: number;
};

const LINES = [
  "recited_new",
  "recited_review",
  "heard_recitation",
  "prayed_with_memorised",
] as const;

/**
 * بطاقة تتميم الورد.
 *
 * Lists what was done and nothing else. A card carrying a mark against an
 * item she did not manage becomes a reproach sent into a group chat — the
 * counting belongs on the معلمة's board, and this is the thing she is glad
 * to send.
 *
 * No emoji. The academy's own version leans on 🍀 and 🌸 to divide and to say
 * "done", and they do real work there — but they draw differently on every
 * device, say nothing to a screen reader, and print badly. Borders, a rule
 * and one drawn check do the same work and survive being shared.
 */
export function CardClient({
  academySlug,
  locale,
}: {
  academySlug: string;
  locale: string;
}) {
  const t = useTranslations("card");
  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const supabase = useMemo(() => createClient(), []);

  const me = useSyncExternalStore(
    subscribeMe,
    useCallback(() => getMe(key), [key]),
    () => null,
  );

  const [day, setDay] = useState<Day | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (me && loadedFor !== me.studentId) {
    setLoadedFor(me.studentId);
    void (async () => {
      const { data, error } = await supabase.rpc("my_track_week" as never, {
        p_student_id: me.studentId,
        p_phone: me.phone,
      } as never);
      if (error) {
        setState("error");
        return;
      }
      const rows = (data ?? []) as unknown as Day[];
      const today = rows.find((r) => r.is_today);
      if (!today) {
        setState("none");
        return;
      }
      setDay(today);
      setState("ready");
    })();
  }

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        {t("signInFirst")}{" "}
        <Link href={`/${academySlug}/me`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  if (state === "loading") {
    return <p className="card text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (state === "error" || !day) {
    return <p className="card text-sm text-absent">{t("failed")}</p>;
  }

  const done = LINES.filter((l) => day[l]);
  const core = day.recited_new && day.recited_review;

  const dayName = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
  }).format(new Date(`${day.session_date}T00:00:00Z`));

  // The plain-text twin, for wherever a picture cannot go.
  const asText = [
    t("heading", { day: dayName }),
    "",
    t("studentLine", { name: me.name }),
    day.partner_name ? t("partnerLine", { name: day.partner_name }) : null,
    "",
    ...done.map((l) => `— ${t(`items.${l}`)}`),
  ]
    .filter((line) => line !== null)
    .join("\n");

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: asText });
        return;
      } catch {
        // She dismissed the sheet, or the browser refused. Fall through to
        // the clipboard rather than telling her something failed.
      }
    }
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!core) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <section className="card border-accent-300 bg-accent-100 dark:border-accent-700 dark:bg-accent-700/20">
          <p className="font-bold text-accent-700 dark:text-accent-200">
            {t("notYet")}
          </p>
          <p className="mt-1 text-sm text-accent-700/85 dark:text-accent-200/85">
            {t("notYetNote")}
          </p>
        </section>
        <Link href={`/${academySlug}/me/track`} className="btn-primary min-h-12 text-center">
          {t("backToDay")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("title")}</h1>

      <article className="overflow-hidden rounded-3xl border border-brand-200 bg-surface dark:border-brand-700">
        <header className="bg-brand-900 px-5 py-4 text-center">
          <p className="font-display text-xl font-bold text-white">
            {t("heading", { day: dayName })}
          </p>
          <p className="mt-1 text-xs text-brand-100">
            {t("place", { track: day.track_name, week: day.week_number })}
          </p>
        </header>

        <div className="flex border-b border-border-subtle">
          <div className="flex-grow px-4 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">{t("student")}</p>
            <p className="mt-0.5 font-display text-lg font-bold">{me.name}</p>
          </div>
          {day.partner_name && (
            <>
              <div aria-hidden="true" className="w-px bg-border-subtle" />
              <div className="flex-grow px-4 py-3 text-center">
                <p className="text-[11px] text-muted-foreground">{t("partner")}</p>
                <p className="mt-0.5 font-display text-lg font-bold">
                  {day.partner_name}
                </p>
              </div>
            </>
          )}
        </div>

        <p className="px-5 pb-1 pt-3 text-center font-display text-[15px] text-brand-700 dark:text-brand-300">
          {t("praise")}
        </p>

        <ul className="flex flex-col gap-2.5 px-5 pb-5 pt-2">
          {done.map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
              </span>
              <span className="text-sm">{t(`items.${line}`)}</span>
            </li>
          ))}
        </ul>
      </article>

      <div className="flex gap-2">
        <button type="button" onClick={share} className="btn-primary min-h-12 flex-grow">
          <span className="inline-flex items-center justify-center gap-2">
            {copied ? (
              <Copy className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Share2 className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? t("copied") : t("share")}
          </span>
        </button>
        <Link
          href={`/${academySlug}/me/track`}
          className="btn-secondary flex min-h-12 shrink-0 items-center px-5"
        >
          {t("edit")}
        </Link>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}
