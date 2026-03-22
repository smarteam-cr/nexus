import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // echarts-for-react y echarts son paquetes ESM que necesitan transpilación en Next.js
  transpilePackages: ["echarts", "echarts-for-react", "zrender"],
  // Evitar que Turbopack intente crear junction points para @prisma/client en Windows
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-pool",
    "pg-native",
    "pg-connection-string",
    "pgpass",
  ],
};

export default nextConfig;
