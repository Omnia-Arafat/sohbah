"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A minimal FLIP: whenever an item tagged `data-flip-id` ends up somewhere
 * else after a render — a student marked "done" and sank to the bottom of
 * the queue, say — it is nudged back to its old spot with no transition and
 * released, so the browser animates the move instead of the row just
 * jumping there.
 *
 * Runs after every render with no dependency array on purpose: a reorder
 * can come from this device's own action or from Realtime echoing someone
 * else's, and both should animate the same way. Shared by the teacher's
 * live queue (session-client.tsx) and the student's own circle page
 * (circle-client.tsx) so a finished recitation sinks the same way for
 * everyone watching.
 */
export function useReorderAnimation<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const previousTops = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.children) as HTMLElement[];
    const nextTops = new Map<string, number>();

    for (const item of items) {
      const id = item.dataset.flipId;
      if (!id) continue;

      const top = item.getBoundingClientRect().top;
      nextTops.set(id, top);

      const previousTop = previousTops.current.get(id);
      if (previousTop !== undefined && Math.abs(previousTop - top) > 1) {
        const delta = previousTop - top;
        item.style.transition = "none";
        item.style.transform = `translateY(${delta}px)`;
        requestAnimationFrame(() => {
          item.style.transition = "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)";
          item.style.transform = "";
        });
      }
    }

    previousTops.current = nextTops;
  });

  return containerRef;
}
