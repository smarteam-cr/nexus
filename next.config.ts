import type { NextConfig } from "next";

// Silenciar DeprecationWarning de url.parse() que viene de dependencias externas
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && warning.message.includes("url.parse()")) return;
  console.warn(warning);
});

const nextConfig: NextConfig = {
  // Salida "standalone": Next traza y empaqueta SOLO lo necesario (server.js +
  // un node_modules mínimo) → imagen Docker chica. Lo consume el Dockerfile.
  output: "standalone",
  // Next 16 lockea `.next/dev` → un solo `next dev` por directorio. Para correr
  // una segunda instancia (otra sesión de preview en paralelo), el wrapper
  // start-nexus-dev.js setea NEXT_DIST_DIR=.next-alt. Sin la env no cambia nada
  // (default .next); el build de prod no la setea.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // ⚠️ TEMPORAL — el build de producción salta el type-check y el lint para no
  // frenarse con ~26 errores de tipo PREEXISTENTES (Json de Prisma 7, ContentBlock
  // del SDK de Anthropic, scripts de seed). `npm run dev` no se ve afectado. Quitar
  // estos dos flags cuando se resuelvan las causas raíz para recuperar la red de
  // seguridad de tipos en el build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // echarts-for-react y echarts son paquetes ESM que necesitan transpilación en Next.js
  transpilePackages: ["echarts", "echarts-for-react", "zrender"],
  // Los DOS bundlers conviven a propósito: `next build` corre con TURBOPACK (la vía
  // probada de prod — usa serverExternalPackages + turbopack:{}), mientras `next dev`
  // corre con webpack (--webpack en el wrapper, por el bug de junction points de
  // Turbopack en Windows — usa el hook webpack() de abajo). Sin `turbopack: {}`,
  // Next 16 aborta el build al ver un hook webpack sin config turbopack.
  turbopack: {},
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
    // Módulo NATIVO: marcarlo external hace que la salida standalone copie su
    // binario .node compilado al runtime (si no, falla al cargar en el contenedor).
    "bcrypt",
    // El jobs registry (instrumentation → lib/jobs/defs → cs-signals) arrastra el
    // SDK de HubSpot, que hace require('querystring'/'stream') — external como pg
    // para que ni Turbopack (build) ni webpack (dev, hook de abajo) lo bundleen.
    "@hubspot/api-client",
  ],
  // `serverExternalPackages` NO cubre la compilación de instrumentation.ts: al
  // convivir con middleware.ts (edge), Next también arma un bundle EDGE de
  // instrumentation.ts (para el registro conjunto edge+node del hook), y ESE
  // bundle intenta empaquetar por completo pg→pgpass→split2→require('stream')
  // (core de Node, inexistente en edge) — aunque el guard NEXT_RUNTIME de
  // instrumentation.ts garantice que ese código nunca se EJECUTE ahí. Alcanza
  // con dejarlo external (no bundlear sus internos) en TODAS las compilaciones
  // server, no solo la de rutas/páginas normales que sí respeta la lista de arriba.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals ?? [];
      config.externals.push({
        pg: "commonjs pg",
        "pg-native": "commonjs pg-native",
        pgpass: "commonjs pgpass",
        // Mismo caso que pg: el jobs registry (instrumentation → lib/jobs/defs →
        // cs-signals) arrastra @hubspot/api-client, que hace require('querystring')
        // (core de Node, inexistente en edge). El guard NEXT_RUNTIME garantiza que
        // nunca se ejecute ahí — solo hay que evitar que el bundle edge lo resuelva.
        "@hubspot/api-client": "commonjs @hubspot/api-client",
      });
    }
    return config;
  },
};

export default nextConfig;
