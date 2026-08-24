"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Takes a path rather than a full URL so the server never has to guess the
 * deployment's origin; the browser resolves it against the current one.
 */
export function CopyLinkButton({ path }: { path: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      const url = new URL(path, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure origin, denied permission).
      // The link text is on screen either way, so failing quietly is fine.
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-secondary px-4 py-2 text-sm">
      {copied ? t("copied") : t("copyLink")}
    </button>
  );
}
