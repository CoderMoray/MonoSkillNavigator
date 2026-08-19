import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"],
  allowedDevOrigins: ["127.0.0.1"]
};

export default nextConfig;
