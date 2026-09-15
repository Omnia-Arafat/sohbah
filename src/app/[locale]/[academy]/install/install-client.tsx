"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Download,
  Share,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * "Send them a link and they install it" — which is not how installing a web
 * app works, and the gap is worth a page of its own.
 *
 * NO URL CAN INSTALL ANYTHING. The browser decides, and the two big ones
 * decide differently:
 *
 *   Android/Chrome fires `beforeinstallprompt`, which can be held and replayed
 *   from a button. So there IS a real install button, and it is the whole page
 *   for most of this academy.
 *
 *   iOS Safari fires nothing, ever. Add to Home Screen is buried in the share
 *   sheet and there is no API to open it or even to detect that it is
 *   available. All that can be done is tell her where it is — which is exactly
 *   why students on iPhones were never going to find this on their own.
 *
 * So this page shows whichever of those two applies, decided from the browser
 * rather than shown side by side: a student following steps for a phone she is
 * not holding is worse off than one with no instructions at all.
 */

/** The event Chrome fires, which TypeScript's DOM lib does not describe. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "promptable" | "other";

/*
  Two facts that only the browser knows, read through `useSyncExternalStore`
  rather than assigned from an effect.

  An effect would be the obvious way and is the wrong one here: it renders the
  page once with the server's guess and again with the truth, and the guess is
  "not an iPhone". A student on an iPhone would see a flash of the Android
  section — instructions for a phone she is not holding — before the right
  ones replace it. This subscribes instead, so the first paint is already
  correct on the client and the server renders neither section.
*/

/** Whether the app is already running from the home screen. */
function subscribeInstalled(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

function getInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag: iOS has no display-mode media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Never changes for the life of the page, so nothing to subscribe to. */
const subscribeNever = () => () => {};

function getIsIOS(): Platform {
  const ua = window.navigator.userAgent;
  // iPadOS reports itself as a Mac, and the touch points are what give it away
  // — without this, an iPad gets Android instructions it cannot follow.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIOS ? "ios" : "other";
}

export function InstallClient({ academySlug }: { academySlug: string }) {
  const t = useTranslations("install");

  const installed = useSyncExternalStore(subscribeInstalled, getInstalled, () => false);
  const detected = useSyncExternalStore<Platform | null>(
    subscribeNever,
    getIsIOS,
    () => null,
  );

  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [outcome, setOutcome] = useState<"done" | "dismissed" | null>(null);
  const [copied, setCopied] = useState(false);

  // Chrome offering the prompt outranks the user-agent guess: it means a real
  // install is available right now, which is better than any instructions.
  const platform: Platform | null = promptEvent ? "promptable" : detected;

  useEffect(() => {
    function onPrompt(event: Event) {
      // Holding the event is the entire trick: unprevented, Chrome shows its
      // own banner once and never again, and the button below would have
      // nothing to replay.
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome: choice } = await promptEvent.userChoice;
    setOutcome(choice === "accepted" ? "done" : "dismissed");
    // The event is single-use; Chrome fires a fresh one if she declines and
    // becomes eligible again.
    setPromptEvent(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard the browser will not give us is not worth an error message:
      // the address bar is right there.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Smartphone className="h-7 w-7 text-brand-600" aria-hidden="true" />
          {t("title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </section>

      {installed ? (
        <section className="card border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40">
          <h2 className="text-lg font-bold">{t("installed.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("installed.body")}</p>
        </section>
      ) : (
        <>
          <section className="card flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t("why.title")}</h2>
            <ul className="flex flex-col gap-3 text-sm">
              <Reason Icon={WifiOff}>{t("why.mushaf")}</Reason>
              <Reason Icon={Smartphone}>{t("why.fast")}</Reason>
              <Reason Icon={Download}>{t("why.light")}</Reason>
            </ul>
          </section>

          {/* Nothing is rendered until the platform is known: a flash of iPhone
              steps on an Android phone reads as the page being wrong. */}
          {platform === "promptable" && (
            <section className="card flex flex-col gap-3">
              <button type="button" onClick={install} className="btn-primary w-full">
                {outcome === "done" ? t("button.done") : t("button.install")}
              </button>
              {outcome === "dismissed" && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("button.dismissed")}
                </p>
              )}
            </section>
          )}

          {platform === "ios" && (
            <section className="card flex flex-col gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Share className="h-5 w-5 text-brand-600" aria-hidden="true" />
                  {t("ios.title")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("ios.note")}</p>
              </div>
              <ol className="flex flex-col gap-3">
                <Step n={1}>{t("ios.step1")}</Step>
                <Step n={2}>{t("ios.step2")}</Step>
                <Step n={3}>{t("ios.step3")}</Step>
              </ol>
              <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
                {t("ios.safariOnly")}
              </p>
            </section>
          )}

          {/* Always present, never the only thing: Chrome withholds the prompt
              for reasons it does not report — too few visits, an install it
              still remembers — and a page whose only button never appears is
              a dead end. */}
          {platform !== null && platform !== "promptable" && platform !== "ios" && (
            <section className="card flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t("manual.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("manual.body")}</p>
              <p className="text-sm text-muted-foreground">{t("manual.chrome")}</p>
              <p className="text-sm text-muted-foreground">{t("manual.desktop")}</p>
            </section>
          )}

          {platform === "promptable" && (
            <section className="card flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t("manual.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("manual.body")}</p>
            </section>
          )}
        </>
      )}

      <section className="card flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <WifiOff className="h-5 w-5 text-brand-600" aria-hidden="true" />
            {t("offline.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("offline.body")}</p>
        </div>
        <Link
          href={`/${academySlug}/mushaf`}
          className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {t("offline.cta")}
        </Link>
      </section>

      <section className="card flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("share.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("share.body")}</p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? t("share.copied") : t("share.copy")}
        </button>
      </section>
    </div>
  );
}

function Reason({
  Icon,
  children,
}: {
  Icon: typeof WifiOff;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                   bg-brand-600 text-sm font-bold text-white"
      >
        {n}
      </span>
      <span className="pt-0.5 text-sm">{children}</span>
    </li>
  );
}
