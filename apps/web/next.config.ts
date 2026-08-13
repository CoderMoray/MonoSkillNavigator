import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"],
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;
