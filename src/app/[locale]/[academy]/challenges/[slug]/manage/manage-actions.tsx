"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { CopyLinkButton } from "@/components/copy-link-button";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The link to hand out — copied, or sent straight through the phone's share
 * sheet — and stopping or resuming the challenge.
 */
export function ManageActions({
  academySlug,
  slug,
  challengeId,
  title,
  isActive,
}: {
  academySlug: string;
  slug: string;
  challengeId: string;
  title: string;
  isActive: boolean;
}) {
  const t = useTranslations("challenges");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const path = `/${academySlug}/c/${slug}`;

  async function send() {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.share?.({ title, text: t("shareText", { title }), url });
    } catch {
      // Closed the sheet: nothing to do.
    }
  }

  async function toggle() {
    setBusy(true);
    const { error } = await supabase.rpc("dhikr_challenge_set_active", {
      p_challenge_id: challengeId,
      p_active: !isActive,
    });
    if (error) console.error("dhikr_challenge_set_active failed", error);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-bold">{t("link")}</h2>
        <div className="flex items-center gap-2">
          <p dir="ltr" className="min-w-0 flex-grow truncate rounded-xl bg-surface-muted px-3 py-2.5 text-xs text-muted-foreground">
            {path}
          </p>
          <CopyLinkButton path={path} />
        </div>
        <button type="button" onClick={send} className="btn-primary w-full">
          <Send aria-hidden="true" className="h-4 w-4" />
          {t("sendGroup")}
        </button>
      </section>

      <button type="button" onClick={toggle} disabled={busy} className={isActive ? "btn-danger w-full py-3" : "btn-secondary w-full"}>
        {isActive ? t("stop") : t("resume")}
      </button>
    </>
  );
}
