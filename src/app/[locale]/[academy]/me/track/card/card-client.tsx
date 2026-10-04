"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { canvasToFile } from "@/lib/friday-share-image";
import { renderTrackCard } from "@/lib/track-card-image";
import { trackQuery, tracksOf, useMyRecord, type MyTrackDay } from "@/lib/use-my-record";
import { useSearchParams } from "next/navigation";

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
 * It goes out as a picture (lib/track-card-image.ts): the plain text it used
 * to be arrived in the group as one more grey message. «نسخ كنص» stays for
 * wherever a picture cannot go. No emoji, in either.
 */
export function CardClient({
  academySlug,
  locale,
  academyName,
}: {
  academySlug: string;
  locale: string;
  academyName: string;
}) {
  const t = useTranslations("card");
  const tItems = useTranslations("trackDay.items");
  const { me, data } = useMyRecord(academySlug);

  // The track named by ?e=, or her first.
  const requested = useSearchParams().get("e");
  const tracks = tracksOf(data?.trackDays ?? []);
  const days = tracks.find((group) => group[0].enrollment_id === requested) ?? tracks[0] ?? [];
  const day: MyTrackDay | null = days.find((row) => row.is_today) ?? null;
  const query = day ? trackQuery(day.enrollment_id, tracks.length) : "";

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);

  const numberLocale = locale === "ar" ? "ar-EG" : "en-GB";
  const done = day ? LINES.filter((line) => day[line]) : [];
  const core = Boolean(day?.recited_new && day?.recited_review);

  const date = day ? new Date(`${day.session_date}T00:00:00Z`) : null;
  const dayName = date
    ? new Intl.DateTimeFormat(numberLocale, { weekday: "long", timeZone: "UTC" }).format(date)
    : "";

  // "٦ أكتوبر ٢٠٢٦ · ٢٥ ربيع الآخر ١٤٤٨ هـ", then the time she saved it when
  // the database returns it.
  const when = (() => {
    if (!date || !day) return "";
    const parts = [
      new Intl.DateTimeFormat(numberLocale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    ];
    try {
      parts.push(
        new Intl.DateTimeFormat(`${numberLocale}-u-ca-islamic-umalqura`, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(date),
      );
    } catch {
      // A browser without the Islamic calendar shows the Gregorian date alone.
    }
    if (day.reported_at) {
      parts.push(
        new Intl.DateTimeFormat(numberLocale, { hour: "numeric", minute: "2-digit" }).format(
          new Date(day.reported_at),
        ),
      );
    }
    return parts.join(" · ");
  })();

  const chips = day
    ? [
        ...(day.cohort_name ? [{ text: day.cohort_name, tone: "green" as const }] : []),
        {
          text: day.duration_weeks
            ? t("week", { week: day.week_number, total: day.duration_weeks })
            : t("weekOnly", { week: day.week_number }),
          tone: "green" as const,
        },
        ...(day.teacher_name
          ? [
              {
                text: t("teacher", { gender: me?.genderCategory ?? "female", name: day.teacher_name }),
                tone: "gold" as const,
              },
            ]
          : []),
      ]
    : [];

  const imageKey =
    day && me && core
      ? JSON.stringify([day.session_date, day.reported_at, done, me.name, day.partner_name, chips, when])
      : null;

  useEffect(() => {
    if (!imageKey || !day || !me) return;
    let cancelled = false;
    (async () => {
      const canvas = await renderTrackCard({
        academy: academyName,
        heading: t("imageHeading"),
        day: t("imageDay", { day: dayName }),
        when,
        track: day.track_name,
        chips,
        student: { label: t("student"), name: me.name },
        partner: day.partner_name ? { label: t("partner"), name: day.partner_name } : null,
        items: done.map((line) => tItems(line)),
        closing: t("praise"),
      });
      const png = await canvasToFile(canvas, `wird-${day.session_date}.png`);
      if (cancelled) return;
      setFile(png);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(png);
      });
    })().catch((error) => console.error("track card image failed", error));
    return () => {
      cancelled = true;
    };
    // imageKey stands in for everything drawn on the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey, academyName]);

  if (!me) {
    return (
      <p className="card text-sm text-muted-foreground">
        {t("signInFirst")}{" "}
        <Link href={`/${academySlug}`} className="font-semibold underline">
          {t("myPage")}
        </Link>
      </p>
    );
  }

  if (!data) {
    return <p className="card text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (!day) {
    return <p className="card text-sm text-absent">{t("failed")}</p>;
  }

  if (!core) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <section className="card border-accent-300 bg-accent-100 dark:border-accent-700 dark:bg-accent-700/20">
          <p className="font-bold text-accent-700 dark:text-accent-200">{t("notYet")}</p>
          <p className="mt-1 text-sm text-accent-700/85 dark:text-accent-200/85">{t("notYetNote")}</p>
        </section>
        <Link href={`/${academySlug}/me/track${query}`} className="btn-primary min-h-12 text-center">
          {t("backToDay")}
        </Link>
      </div>
    );
  }

  // The plain-text twin, for wherever a picture cannot go.
  const asText = [
    t("heading", { day: dayName }),
    [day.track_name, ...chips.map((chip) => chip.text)].join(" · "),
    when,
    "",
    t("studentLine", { name: me.name }),
    day.partner_name ? t("partnerLine", { name: day.partner_name }) : null,
    "",
    ...done.map((line) => `— ${t(`items.${line}`)}`),
  ]
    .filter((line) => line !== null)
    .join("\n");

  async function shareImage() {
    if (!file) return;
    const payload = { files: [file] };
    if (navigator.canShare?.(payload)) {
      try {
        await navigator.share(payload);
      } catch {
        // She closed the sheet: nothing to report.
      }
    } else {
      setFallback(true);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">{t("title")}</h1>

      <div className="overflow-hidden rounded-2xl bg-brand-950 shadow-md">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from a canvas, not an asset
          <img
            src={url}
            alt={t("imageAlt", { day: dayName })}
            className="block w-full"
            width={1080}
            height={1350}
          />
        ) : (
          <div className="aspect-[1080/1350] w-full animate-pulse" />
        )}
      </div>

      {fallback && <p className="text-center text-xs text-muted-foreground">{t("fallback")}</p>}

      <button type="button" onClick={shareImage} disabled={!file} className="btn-primary min-h-12 w-full gap-2">
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {t("share")}
      </button>
      <div className="grid grid-cols-2 gap-2">
        {fallback && url ? (
          <a href={url} download={`wird-${day.session_date}.png`} className="btn-secondary min-h-11 gap-2 px-3 text-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("save")}
          </a>
        ) : (
          <button type="button" onClick={copyText} className="btn-secondary min-h-11 gap-2 px-3 text-sm">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? t("copied") : t("copyText")}
          </button>
        )}
        <Link href={`/${academySlug}/me/track${query}`} className="btn-secondary min-h-11 px-3 text-sm">
          {t("edit")}
        </Link>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  );
}
