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

/**
 * The mushaf page cache, VERSIONED.
 *
 * "The Quran does not change" is true of the text and not of how we draw it:
 * cache-first for a year meant a page she had opened kept its old HTML for a
 * year, so when the البسملة was moved to its own line and the waqf marks were
 * seated on their words, every الكهف read on a Friday stayed broken on her
 * phone. Bump the suffix whenever the page's rendering of the text changes;
 * the old caches are deleted on activate below.
 */
const MUSHAF_PAGES = "sohbah-mushaf-pages-v2";
const STALE_MUSHAF_PAGES = ["sohbah-mushaf-pages"];

/**
 * The last thing between a student and the browser's own error page.
 *
 * Every navigation strategy here can run out of options: the network fails
 * and the cache has nothing to offer — on a first visit, or after
 * `purgeOnQuotaError` has emptied a cache to free space. Returning undefined
 * at that point hands her "This page couldn't load", which is exactly the
 * outcome the mushaf caching notes say all this machinery exists to prevent.
 *
 * Built as a string rather than a precached route on purpose. A precached
 * fallback is one more thing that has to have been fetched successfully at
 * least once, and this has to work in the case where nothing was. It ships
 * inside the worker itself, so it cannot be missing.
 */
function offlinePage(): Response {
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>لا يوجد اتصال</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f6f9f7; color:#0e1f19; font-family:system-ui,sans-serif; padding:24px; }
  main { max-width:22rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; }
  p { margin:0 0 1.25rem; font-size:.9rem; color:#5a6e66; line-height:1.8; }
  button { min-height:44px; padding:0 22px; border:0; border-radius:12px;
           background:#1e6e51; color:#fff; font:inherit; font-weight:700; cursor:pointer; }
</style>
</head>
<body>
  <main>
    <h1>لا يوجد اتصال</h1>
    <p>لم نستطع فتح هذه الصفحة، ولم تُفتح من قبل على هذا الجهاز حتى نعرضها من الذاكرة. افتحيها مرة واحدة وأنتِ متصلة، وبعدها تعمل بدون إنترنت.</p>
    <button type="button" onclick="location.reload()">إعادة المحاولة</button>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

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
      The mushaf TEXT — all 604 pages, 1.4MB, precached with the app.

      This is what makes the whole mushaf readable offline rather than only the
      pages she happened to open. Caching 604 rendered documents would be 60MB+
      and is not an option; the text itself is 1.4MB, and `MushafPageView`
      redraws any page from it. Cache-first and effectively forever: the Quran
      does not change, and the file is rebuilt only when
      scripts/export-quran.mjs is re-run.
    */
    {
      matcher: ({ url }) => url.pathname === "/quran/pages.json",
      handler: new CacheFirst({
        cacheName: "sohbah-quran-text",
        plugins: [
          new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },

    /*
      Mushaf pages. Cache-first on purpose, and the one place in this app where
      that is the right call: the Quran does not change, so there is nothing to
      revalidate and no reason to make her wait.

      Keeps the last 120 documents she opened. A page that is NOT among them is
      not a dead end: `handlerDidError` below returns any mushaf document the
      cache does hold, and the view corrects it from the text above. That is
      why this cap can stay small.
    */
    {
      matcher: ({ url, request }) =>
        request.destination === "document" && /\/mushaf\/\d+$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: MUSHAF_PAGES,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 60 * 60 * 24 * 365,
            purgeOnQuotaError: true,
          }),
          {
            /*
              She asked for a page she has never opened, and there is no
              network. Hand her ANY mushaf document that is cached — the
              layout, the font, the frame are identical on every page, and
              `MushafPageView` reads the page number out of the address bar
              and redraws the right ayahs from the precached text.

              Returning undefined here would be the browser's offline error,
              which is the one outcome worth this much machinery to avoid.
            */
            handlerDidError: async () => {
              const cache = await caches.open(MUSHAF_PAGES);
              const [any] = await cache.keys();
              const cached = any ? await cache.match(any) : undefined;
              // An EMPTY cache used to fall through to `undefined` here, which
              // is the browser's own error page — the exact outcome the note
              // above says all this machinery exists to avoid. See offlinePage.
              return cached ?? offlinePage();
            },
          },
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
          {
            // Same gap as the mushaf had: no network and nothing cached for
            // this page meant the browser's error. A page she has never
            // opened cannot be conjured, but it can be said in her language.
            handlerDidError: async () => offlinePage(),
          },
        ],
      }),
    },

    // Next's own build output, images and the rest — Serwist's defaults are
    // already right for immutable, hashed assets.
    ...defaultCache,
  ],
});

serwist.addEventListeners();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all(STALE_MUSHAF_PAGES.map((name) => caches.delete(name))),
  );
});
