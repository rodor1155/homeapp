import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so bundler root inference doesn't walk up to
  // stray lockfiles outside the repo.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/kid/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  experimental: {
    // Tab switches felt like a full page load because dynamic routes default
    // to staleTimes.dynamic = 0 (no Client Cache). Keep recently visited tabs
    // in memory so jumping Home ↔ Family reuses the RSC payload; pull-to-refresh
    // and server actions still force a fresh read.
    // (Do not set cachedNavigations here — it requires cacheComponents.)
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },
};

export default nextConfig;
