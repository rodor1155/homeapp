import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so bundler root inference doesn't walk up to
  // stray lockfiles outside the repo.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
