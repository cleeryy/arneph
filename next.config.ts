import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl) : null;
const isLocalHost =
  supabaseOrigin?.hostname === "127.0.0.1" ||
  supabaseOrigin?.hostname === "localhost";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: supabaseOrigin.protocol.replace(/:$/, "") as
              | "http"
              | "https",
            hostname: supabaseOrigin.hostname,
            port: supabaseOrigin.port,
            pathname: "/storage/v1/object/public/webtoon-images/**",
          },
        ]
      : [],
    // SSRF guard: Next blocks private-IP upstreams; relax only for local dev
    // (local Supabase), prod keeps the default protection.
    dangerouslyAllowLocalIP: isLocalHost,
    // Webtoon images are immutable: cache optimized output 30 days.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ["image/avif", "image/webp"],
    // Explicit allowlist required by Next 16.
    qualities: [50, 75, 90],
  },
};

export default withNextIntl(nextConfig);
