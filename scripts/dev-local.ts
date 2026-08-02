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
/* Sin esto, `process.env.DATABASE_URL` es undefined ACÁ y el chequeo de la línea ~37 abortaba
   `npm run dev:prod` con "Falta DATABASE_URL en el .env" aunque la variable estuviera declarada.
   Falso negativo puro: Next lee el `.env` por su cuenta en el proceso HIJO, así que la app habría
   arrancado bien — el único roto era el guard. No se detectó antes porque la verificación de la
   inversión de defaults (2026-08-01) se hizo sobre la instancia LOCAL, que no lee esta variable
   (se la inyecta). Lección: un guard que nunca se ejercitó no está verificado.
   ⚠ Cargar el `.env` acá NO afecta el aislamiento del modo local: el spawn de abajo pisa
   `DATABASE_URL` y blanquea las credenciales de Google DESPUÉS del spread de `process.env`. */
import "dotenv/config";
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
  console.log("   Sync de Google APAGADO (las sesiones entran por el fixture o db:local:pull).");
  console.log("   ¿Necesitás datos REALES? → npm run dev:prod (puerto 3005).\n");
}

/**
 * Aislar la base NO alcanza: hay que aislar también las INTEGRACIONES DE ENTRADA.
 *
 * Mordido el 2026-08-02: con la base local ya conectada, el auto-sync de Google
 * (`lib/google/auto-sync.ts`, se dispara SOLO en background al usar la app, cooldown
 * de 20 min) metió 4.771 sesiones REALES de Google Workspace en `nexus_local`, y el
 * agente post-sesión les corrió encima creando 160 ActionItems — consumiendo API de
 * Anthropic de verdad. La base estaba aislada; las credenciales del `.env` no.
 *
 * Se apagan BORRANDO las credenciales, no con un flag nuevo: `autoSyncGoogleMeet` ya
 * chequea su presencia y devuelve `{skipped, reason:"google_not_configured"}`. Cero
 * ramas nuevas en el código de producción.
 *
 * Lo que SÍ se conserva en local, a propósito:
 *   · ANTHROPIC_API_KEY — probar que el handoff/kickoff GENERAN bien es justamente
 *     para lo que existe este entorno. Los agentes se disparan a mano, no solos.
 *   · HubSpot — su token vive en la tabla `HubspotAccount`, que en la base local está
 *     vacía; la app ya degrada con "Sin actividad en HubSpot".
 *
 * Las sesiones de la base local entran por donde uno DECIDE: el fixture, o
 * `npm run db:local:pull -- --client "..."`. Nunca por un sync automático.
 *
 * ⚠ REGLA PARA EL PRÓXIMO SPAWN DE ESTE ARCHIVO: desde que el script carga `dotenv/config`
 * (arriba), el proceso PADRE tiene en memoria el `.env` ENTERO — Google, ANTHROPIC, la service
 * role de Supabase, el token de Apify y el `DATABASE_URL` de PROD. Cualquier hijo que se lance
 * sin blanquear explícitamente los HEREDA. El blanqueo de abajo funciona porque se spreadea
 * DESPUÉS de `...process.env` (la última escritura gana), no porque el padre esté limpio.
 */
const SIN_INTEGRACIONES_DE_ENTRADA = {
  GOOGLE_SERVICE_ACCOUNT_KEY: "",
  GOOGLE_ADMIN_EMAIL: "",
};

const hijo = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    // Contra prod: se respeta el DATABASE_URL del .env. Contra local: se inyecta.
    ...(CONTRA_PROD ? {} : { DATABASE_URL: URL_LOCAL, ...SIN_INTEGRACIONES_DE_ENTRADA }),
    NEXT_DIST_DIR: DIST_DIR,
  },
});

hijo.on("exit", (code) => process.exit(code ?? 0));
