/**
 * scripts/dev-local.ts — la SEGUNDA instancia de Nexus, la que corre contra la base LOCAL.
 *
 * Por qué existe (y por qué NO se cambia el .env): Elías usa Nexus TODOS LOS DÍAS para
 * trabajo real. Si el `.env` apuntara a la base local, su herramienta diaria pasaría a
 * mostrar datos de prueba y tendría que estar cambiando el archivo de ida y vuelta —
 * justo el tipo de paso manual que se olvida y termina en "¿por qué no veo a mis
 * clientes?". Con dos instancias conviven las dos realidades sin tocar nada:
 *
 *   npm run dev         → http://localhost:3004   base de PRODUCCIÓN  (su Nexus de siempre)
 *   npm run dev:local   → http://localhost:3005   base LOCAL          (pruebas, descartable)
 *
 * Tres cosas tienen que ser distintas para que convivan sin pisarse:
 *   1. El PUERTO (3005 vs 3004) — dos procesos no pueden escuchar el mismo.
 *   2. La BASE (`DATABASE_URL` inyectada acá, sin tocar el .env del disco).
 *   3. El DIRECTORIO DE BUILD (`.next-alt` vs `.next`) — comparten el caché de Turbopack
 *      y se corrompen mutuamente. `.next-alt` ya está en .gitignore y en los ignores de
 *      ESLint (se aprendió en F1: linteaba ~650 errores de chunks generados).
 *
 * La base local tiene que estar arriba: `npm run db:local -- up` (y `-- seed` la primera vez).
 */
import { spawn, spawnSync } from "node:child_process";

const PUERTO = 3005;
const URL_LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";

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
  console.error("   (y si es la primera vez, sembrala con:  npm run db:local -- seed)");
  process.exit(1);
}

console.log(`\n🧪 Nexus LOCAL (datos de prueba) → http://localhost:${PUERTO}`);
console.log(`   Base: ${URL_LOCAL}`);
console.log(`   Tu Nexus de siempre (producción) sigue intacto en el 3004.\n`);

const hijo = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    DATABASE_URL: URL_LOCAL,
    // Build dir propio: compartir .next con la instancia de prod corrompe el caché de ambas.
    NEXT_DIST_DIR: ".next-alt",
  },
});

hijo.on("exit", (code) => process.exit(code ?? 0));
