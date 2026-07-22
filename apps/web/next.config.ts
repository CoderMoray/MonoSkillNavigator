import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"]
};

export default nextConfig;
