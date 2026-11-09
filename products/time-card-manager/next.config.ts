import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { SLPCC63_PRODUCT_RUNTIME: "time-card-manager" },
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  reactStrictMode: true
};

export default nextConfig;
