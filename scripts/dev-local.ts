/**
 * scripts/dev-local.ts — el dev server de TODOS LOS DÍAS: puerto 3004, base LOCAL.
 *
 * Es lo que corre `npm run dev`. Desarrollar contra la base que usan los clientes fue el
 * defecto histórico que este plan vino a cerrar (un `db push` ya se llevó la tabla
 * RoleProfile una vez): el trabajo diario es escribir código nuevo, y para eso la base
 * correcta es una descartable. La validación con datos REALES ocurre donde corresponde —
 * en producción, con Customer Success (decisión de Elías, 2026-08-01).
 *
 *   npm run dev        → http://localhost:3004   base LOCAL       ← el default, seguro
 *   npm run dev:prod   → http://localhost:3005   base PRODUCCIÓN  ← explícito, excepcional
 *
 * El 3004 se conserva a propósito: es el MISMO puerto en el que corre el contenedor de
 * producción (docker-compose: `PORT: "3004"`), y esa paridad es deliberada. Cambiar de
 * base NO cambia el puerto — son cosas independientes.
 *
 * Tres cosas difieren entre las dos instancias para que puedan convivir sin pisarse:
 *   1. El PUERTO (3004 / 3005) — dos procesos no pueden escuchar el mismo.
 *   2. La BASE (`DATABASE_URL` inyectada acá; el `.env` del disco NO se toca — sigue
 *      siendo la fuente para los scripts de operación y el CLI de Prisma, que
 *      legítimamente apuntan a prod y están gateados por ALLOW_PROD_WRITE).
 *   3. El DIRECTORIO DE BUILD (`.next` / `.next-alt`) — Next 16 lockea `.next/dev`
 *      (un solo `next dev` por directorio) y comparten caché de Turbopack.
 *
 * La base local tiene que estar arriba: `npm run db:local -- up` (y `-- seed` + `-- acceso`
 * la primera vez).
 */
import { spawn, spawnSync } from "node:child_process";

const CONTRA_PROD = process.argv.includes("--prod");

const URL_LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";
const PUERTO = CONTRA_PROD ? 3005 : 3004;
const DIST_DIR = CONTRA_PROD ? ".next-alt" : ".next";

if (CONTRA_PROD) {
  const urlProd = process.env.DATABASE_URL;
  if (!urlProd) {
    console.error("⛔ Falta DATABASE_URL en el .env (la base de producción).");
    process.exit(1);
  }
  console.log(`\n🔴 Nexus contra PRODUCCIÓN → http://localhost:${PUERTO}`);
  console.log("   DATOS REALES DE CLIENTES. Es para MIRAR, no para experimentar.");
  console.log("   Para desarrollar usá `npm run dev` (3004, base local).\n");
} else {
  // ¿La base local responde? Sin esto el server arranca igual y falla recién al primer
  // query, con un error de Prisma en medio de una página — mucho más difícil de leer.
  const ping = spawnSync(
    process.execPath,
    [
      "-e",
      `const {Client}=require("pg");const c=new Client({connectionString:process.argv[1]});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));`,
      URL_LOCAL,
    ],
    { stdio: "ignore" },
  );
  if (ping.status !== 0) {
    console.error("⛔ La base local no responde en localhost:5433.");
    console.error("   Levantala con:  npm run db:local -- up");
    console.error("   Primera vez:    npm run db:local -- seed   (datos de prueba)");
    console.error("                   npm run db:local -- acceso (para poder entrar)");
    console.error("\n   ¿Necesitás ver datos REALES? → npm run dev:prod (puerto 3005)");
    process.exit(1);
  }
  console.log(`\n🧪 Nexus LOCAL (datos de prueba) → http://localhost:${PUERTO}`);
  console.log("   Base descartable: rompé lo que quieras, se rehace con `db:local -- reset`.");
  console.log("   ¿Necesitás datos REALES? → npm run dev:prod (puerto 3005).\n");
}

const hijo = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // Contra prod: se respeta el DATABASE_URL del .env. Contra local: se inyecta.
    ...(CONTRA_PROD ? {} : { DATABASE_URL: URL_LOCAL }),
    NEXT_DIST_DIR: DIST_DIR,
  },
});

hijo.on("exit", (code) => process.exit(code ?? 0));
