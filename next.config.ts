import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

/**
 * Replaces `next-pwa`, which was configured here but never ran: it targets
 * Webpack and stopped at Next 12, so on Next 16's Turbopack builds it was
 * skipped without an error and `/sw.js` was a 404 in production. See
 * `src/app/sw.ts` for what the worker actually caches.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // A worker in development caches the very files being edited, which turns an
  // ordinary change into "why is it not updating".
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {};

export default withNextIntl(withSerwist(nextConfig));
