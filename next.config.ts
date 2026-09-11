import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so bundler root inference doesn't walk up to
  // stray lockfiles outside the repo.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Tab switches felt like a full page load because dynamic routes default
    // to staleTimes.dynamic = 0 (no Client Cache). Keep recently visited tabs
    // in memory so jumping Home ↔ Family reuses the RSC payload; pull-to-refresh
    // and server actions still force a fresh read.
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
    // Prefer the last painted UI while a revisiting navigation resolves, which
    // matters once Capacitor wraps this as an app shell.
    cachedNavigations: true,
  },
};

export default nextConfig;
