import createNextIntlPlugin from "next-intl/plugin";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWAInit = require("next-pwa");
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Only generate the service worker in production builds.
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
});

const nextConfig: NextConfig = {};

export default withNextIntl(withPWA(nextConfig));
