"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Download, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { KAHF_PAGES, formatCount, kahfCount, topMilestone } from "@/lib/friday";
import { canvasToFile, renderShareImage } from "@/lib/friday-share-image";
import { getMe, meKey, subscribeMe } from "@/lib/me-store";
import { fullStudentName } from "@/lib/student-name";
import { useFriday } from "@/lib/use-friday";
import { FridayHeader } from "../friday-parts";

/**
 * Her Friday as one picture, and two ways out: the phone's own share sheet
 * (which is where WhatsApp lives), or saving it.
 *
 * No screenshot needed — a screenshot carries the status bar, the page
 * chrome and whatever else was on screen, and crops differently on every
 * phone.
 */
export function ShareClient({
  academySlug,
  locale,
  staffName,
}: {
  academySlug: string;
  locale: string;
  staffName: string | null;
}) {
  const t = useTranslations("friday");
  const { window, entry } = useFriday(academySlug);

  const key = useMemo(() => meKey(academySlug), [academySlug]);
  const me = useSyncExternalStore(subscribeMe, useCallback(() => getMe(key), [key]), () => null);
  const name = staffName ?? (me ? fullStudentName(me.name, me.fatherName) : "");

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  const numberLocale = locale === "ar" ? "ar-EG" : "en-US";
  const friday = window?.friday ?? null;
  const pages = kahfCount(entry.kahf);

  useEffect(() => {
    if (!friday) return;
    let cancelled = false;
    const [y, m, d] = friday.split("-").map(Number);
    const date = new Intl.DateTimeFormat(numberLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));

    (async () => {
      const canvas = await renderShareImage({
        name,
        count: entry.salawat,
        milestone: topMilestone(entry.salawat),
        kahfPages: entry.kahf,
        labels: {
          academy: t("academy"),
          myWeek: t("shareMyWeek"),
          salawat: t("shareSalawat"),
          kahf:
            pages === KAHF_PAGES
              ? t("shareKahf")
              : pages > 0
                ? t("shareKahfPartial", { count: formatCount(pages, locale) })
                : null,
          closing: t("salawatText"),
          date,
        },
        digits: (n) => formatCount(n, locale),
      });
      const png = await canvasToFile(canvas, `friday-${friday}.png`);
      if (cancelled) return;
      setFile(png);
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(png);
      });
    })().catch((error) => console.error("share image failed", error));

    return () => {
      cancelled = true;
    };
  }, [friday, name, entry.salawat, entry.kahf, pages, numberLocale, locale, t]);

  async function send() {
    if (!file) return;
    const data = { files: [file], text: t("shareText", { count: formatCount(entry.salawat, locale) }) };
    if (navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
      } catch {
        // She closed the sheet: nothing to report.
      }
    } else {
      setFallback(true);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <FridayHeader
        academySlug={academySlug}
        title={t("shareTitle")}
        subtitle={t("cardTitle")}
        backHref={`/${academySlug}/friday`}
        backLabel={t("salawatTitle")}
      />

      <div className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-muted shadow-sm">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from a canvas, not an asset
          <img src={url} alt={t("shareImageAlt")} className="block w-full" width={1080} height={1500} />
        ) : (
          <div className="aspect-[1080/1500] w-full animate-pulse" />
        )}
      </div>

      {fallback && <p className="text-center text-xs text-muted-foreground">{t("shareFallback")}</p>}

      <button type="button" onClick={send} disabled={!file} className="btn-primary w-full gap-2">
        <Send aria-hidden="true" className="h-4 w-4" />
        {t("shareSend")}
      </button>
      {url && (
        <a href={url} download={`friday-${friday}.png`} className="btn-secondary w-full gap-2">
          <Download aria-hidden="true" className="h-4 w-4" />
          {t("shareSave")}
        </a>
      )}
    </div>
  );
}
