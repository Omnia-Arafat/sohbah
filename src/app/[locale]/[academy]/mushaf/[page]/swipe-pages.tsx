"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * Turning the page with a thumb, which is how anyone actually reads a mushaf
 * on a phone. The arrows stay — this is in addition to them, not instead.
 *
 * WHICH WAY IS FORWARD. A mushaf is bound on the right: page 1 is the
 * rightmost, and page 2 lies to its LEFT. To reach it you take the page you
 * are on and turn it towards the right — so a drag that travels LEFT→RIGHT
 * advances, and RIGHT→LEFT goes back. That is the opposite of a Latin book
 * and the same as every paper mushaf, which is the one people's hands already
 * know.
 *
 * This does NOT flip with the interface language. English is a language
 * setting; the binding of the mushaf is not.
 *
 * Arrow keys are wired to the same thing, for anyone on a desktop with a
 * keyboard: ArrowLeft advances, matching the drag.
 */

/** Enough travel to be a deliberate turn rather than a scroll that wandered. */
const THRESHOLD_PX = 60;
/** Beyond this the gesture was a vertical scroll, whatever it did sideways. */
const VERTICAL_TOLERANCE = 50;

export function SwipePages({
  academySlug,
  page,
  lastPage,
  children,
}: {
  academySlug: string;
  page: number;
  lastPage: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  const goto = (target: number) => {
    if (target < 1 || target > lastPage) return;
    router.push(`/${academySlug}/mushaf/${target}`);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Ignore the arrows while someone is typing in the page-number box.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "ArrowLeft") goto(page + 1);
      else if (event.key === "ArrowRight") goto(page - 1);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `goto` closes over `page`, so the listener is rebound when the page does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, lastPage, academySlug]);

  return (
    <div
      // Pointer events rather than touch: the same handler then covers a
      // finger, a stylus and a mouse drag, and works on a laptop trackpad.
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (!from) return;

        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;

        // A mostly-vertical drag is the reader scrolling a long page, and must
        // never be read as a page turn.
        if (Math.abs(dy) > VERTICAL_TOLERANCE) return;
        if (Math.abs(dx) < THRESHOLD_PX) return;

        goto(dx > 0 ? page + 1 : page - 1);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      // Horizontal drags belong to this handler; vertical scrolling stays with
      // the browser, which is what keeps a long page readable.
      //
      // Selection is deliberately LEFT ALONE. A swipe does not drag a
      // highlight across the ayat — measured, not assumed — so disabling it
      // would only take away a reader's ability to select a verse.
      className="touch-pan-y"
    >
      {children}
    </div>
  );
}
