import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl) : null;
const isLocalHost =
  supabaseOrigin?.hostname === "127.0.0.1" ||
  supabaseOrigin?.hostname === "localhost";

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 *
 * Pas de CSP stricte ici : le runtime Next injecte des scripts inline
 * (bootstrap RSC, hydratation) et une politique `script-src 'self'` casserait
 * le rendu. Une CSP durcie demanderait des nonces par requête via un
 * middleware/proxy, hors périmètre de ce durcissement.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Image Docker autonome : `node .next/standalone/server.js`, sans npm start.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    // Les composants passent un `loader` custom (imgproxy `/render/image`) :
    // `remotePatterns` ne s'applique pas à ces images, mais reste la liste
    // blanche des URLs absolues Supabase éventuelles (objets bruts, GIF natifs).
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: supabaseOrigin.protocol.replace(/:$/, "") as
              | "http"
              | "https",
            hostname: supabaseOrigin.hostname,
            ...(supabaseOrigin.port ? { port: supabaseOrigin.port } : {}),
            pathname: "/storage/v1/object/public/webtoon-images/**",
          },
          {
            protocol: supabaseOrigin.protocol.replace(/:$/, "") as
              | "http"
              | "https",
            hostname: supabaseOrigin.hostname,
            ...(supabaseOrigin.port ? { port: supabaseOrigin.port } : {}),
            pathname: "/storage/v1/render/image/public/webtoon-images/**",
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
