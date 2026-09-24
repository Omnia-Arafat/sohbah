"use client";

import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";

/** The header every تحدي الجمعة screen opens with. */
export function FridayHeader({
  academySlug,
  title,
  subtitle,
  backHref,
  backLabel,
}: {
  academySlug: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
}) {
  const t = useTranslations("friday");
  return (
    <div className="flex flex-col gap-3">
      <BackLink href={backHref ?? `/${academySlug}`}>{backLabel ?? t("home")}</BackLink>
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

/** Outside the window: when it opens, and nothing to press. */
export function FridayClosed({ startsAt, locale }: { startsAt: Date; locale: string }) {
  const t = useTranslations("friday");
  const when = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAt);

  return (
    <div className="card flex flex-col gap-1 p-5 text-center">
      <p className="font-bold">{t("closedTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("closedBody", { when })}</p>
    </div>
  );
}
