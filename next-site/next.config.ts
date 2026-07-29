import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the first migration phase compatible with static hosting.
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
