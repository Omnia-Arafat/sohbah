/// <reference lib="webworker" />
/**
 * The service worker.
 *
 * There was a PWA here before, on paper: `next-pwa` was in the config and the
 * manifest was linked. It never produced anything — that package stopped at
 * Next 12 and builds with Webpack, and this app is Next 16 on Turbopack, so it
 * was skipped in silence. `/sw.js` answered 404 in production, which meant the
 * app was installable to the home screen and then showed the browser's offline
 * error the moment the signal dropped. Serwist is the maintained successor and
 * is what actually generates this file's output.
 *
 * WHAT IS CACHED, and why each rule is the way it is:
 *
 *   The mushaf is the whole point. Its pages are read one after another on a
 *   commute or in a masjid, and the text never changes — الكهف ٣٠٣ today is
 *   الكهف ٣٠٣ next year — so a page that has been opened once is served from
 *   the cache first and never waits on the network again.
 *
 *   Everything else about this academy DOES change, and stale is worse than
 *   absent: a queue that is not moving, a circle that has been rescheduled, a
 *   report from last week presented as today's. Those stay network-first, with
 *   the cache only as a fallback when there is no network at all.
 *
 *   Nothing that belongs to one person — «صفحتي», a quiz attempt, a teacher's
 *   dashboard — is precached, because a cache is shared with whoever else uses
 *   the device.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  runtimeCaching: [
    /*
      The mushaf font. 522KB of DigitalKhatt, and without it the page renders
      in a fallback face that is not the mushaf the students memorised from —
      the line breaks are what they picture when they recite. Cached first and
      kept for a year: it is versioned by filename, so a new one is a new URL.
    */
    {
      matcher: ({ url }) => url.pathname.startsWith("/fonts/"),
      handler: new CacheFirst({
        cacheName: "sohbah-fonts",
        plugins: [
          new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },

    /*
      Mushaf pages. Cache-first on purpose, and the one place in this app where
      that is the right call: the Quran does not change, so there is nothing to
      revalidate and no reason to make her wait.

      604 pages at roughly 110KB each is more than any cache should hold, so
      this keeps the last 120 she actually opened — far more than the stretch
      anyone reads in a sitting, and it evicts in the order she stopped using
      them. Reading the whole mushaf offline needs the pages downloaded
      deliberately rather than collected by accident; that is a separate
      feature, not this rule.
    */
    {
      matcher: ({ url, request }) =>
        request.destination === "document" && /\/mushaf\/\d+$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "sohbah-mushaf-pages",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 60 * 60 * 24 * 365,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /*
      Every other page. Network-first so a circle, a queue or a schedule is
      always the live one when there is a signal, and the last copy seen is
      what she gets when there is not. Three seconds is the point past which a
      stale-but-instant page beats a spinner on a bad connection.
    */
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "sohbah-pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        ],
      }),
    },

    // Next's own build output, images and the rest — Serwist's defaults are
    // already right for immutable, hashed assets.
    ...defaultCache,
  ],
});

serwist.addEventListeners();
