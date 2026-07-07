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
  // El type-check del build está ACTIVO (2026-07-07): el baseline de 26 errores
  // históricos se limpió a 0 — entre ellos un bug REAL en runtime que el flag
  // ignoreBuildErrors escondía (send-to-canvas creaba CanvasSuggestion sin el
  // campo requerido `suggested` → throw de Prisma en cada uso). No volver a
  // apagarlo: un error de tipos nuevo debe FRENAR el build, no llegar a prod.
  // (La key `eslint` se quitó: Next 16 ya no la soporta — era un warning en
  // cada build y un error de tipos.)
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
    // Sentry (server): bundleado, Turbopack emite chunks externos con nombres
    // tipo "[externals]_node:inspector_…" — y NTFS no acepta ":" en nombres de
    // archivo → el copiado del standalone falla en builds locales de Windows
    // (EINVAL copyfile). External = se copia desde node_modules con nombres
    // normales. El bundle de CLIENTE (instrumentation-client, report-error) no
    // se ve afectado: serverExternalPackages solo aplica al server.
    "@sentry/nextjs",
    "@sentry/node",
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
