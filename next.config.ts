import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// Picks up ./src/i18n/request.ts automatically.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
