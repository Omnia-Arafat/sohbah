"use client";

import { useEffect } from "react";
import type { createClient } from "@/lib/supabase/client";

/**
 * Keeps a circle's queue live: any insert/update/delete on its attendance
 * calls `refresh()`.
 *
 * Realtime alone is not enough on a phone. A مشرفة switches to the meeting
 * app to listen, the browser is backgrounded, the socket dies, and every
 * change made meanwhile is simply never delivered — her list froze at 10/20
 * while the circle was at 18/20. So the queue is also refetched whenever the
 * page comes back into view, the network comes back, or the channel
 * re-subscribes after a dropped connection.
 */
export function useLiveQueue(
  supabase: ReturnType<typeof createClient>,
  circleId: string,
  refresh: () => unknown,
) {
  useEffect(() => {
    let subscribedOnce = false;

    const channel = supabase
      .channel(`attendance-records:${circleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `circle_id=eq.${circleId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // The first subscribe follows the server render, which is fresh.
        if (subscribedOnce) refresh();
        subscribedOnce = true;
      });

    function handleVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleVisible);
    window.addEventListener("pageshow", handleVisible);

    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleVisible);
      window.removeEventListener("pageshow", handleVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, circleId, refresh]);
}
