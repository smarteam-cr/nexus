/**
 * scripts/local-db.ts — LA BASE LOCAL REPRODUCIBLE (F1 del plan de separación local/PROD).
 *
 * Postgres 17 EMBEBIDO vía npm (devDependency `embedded-postgres` → binarios en
 * node_modules/@embedded-postgres/<plataforma>). Cero instalaciones de sistema: en esta
 * máquina no hay Docker ni WSL, y así la otra PC lo hereda con `npm install`. `pg_ctl`
 * daemoniza el server igual que un servicio — sobrevive al proceso de node.
 *
 * ⚠ Lo que la local NO tiene: pgvector (los binarios embebidos no lo traen). Sin efecto:
 *   la columna `KnowledgeEmbedding.embedding` no tiene ni un lector ni un escritor
 *   (auditado 2026-08-01); after.sql y policies.sql la omiten con un NOTICE.
 *
 * Comandos (npm run db:local -- <cmd>):
 *   up         inicializa (si hace falta) y arranca el server en el puerto 5433
 *   down       lo apaga
 *   status     ¿está corriendo?
 *   bootstrap  aplica el schema COMPLETO a nexus_local y nexus_test:
 *              0_init (migrate deploy) → after.sql → policies.sql
 *   seed       puebla nexus_local: catálogo (agentes/prompts/config/equipo
 *              ficticio) + el fixture fx- (scripts/seed-fixture.ts). F3.
 *   acceso     copia el ROSTER INTERNO real de prod → nexus_local, para poder
 *              ENTRAR a la instancia local con tu cuenta de Google de siempre.
 *   reset      down + borrar datos + up + bootstrap  ← "rehacerla en segundos"
 *   url        imprime las connection strings
 *
 * Datos en .local-db/ (gitignoreado). Auth trust SOLO local (escucha 127.0.0.1).
 * PROD es 17.6 y esto es 17.10 — mismo major, paridad de comportamiento.
 * El guard anti-prod NO exige ALLOW_PROD_WRITE acá: localhost no es prod (a propósito).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import "dotenv/config";
import { assertLocalWriteOnly, describirDestino, esHostProduccion } from "./lib/guard";
import { createScriptDbFor } from "./lib/db";
import { copiarRosterInterno } from "./lib/roster";

const RAIZ = process.cwd();
const PUERTO = 5433;
const DATA = join(RAIZ, ".local-db", "data");
const LOG = join(RAIZ, ".local-db", "postgres.log");
const BASES = ["nexus_local", "nexus_test"] as const;

function binDir(): string {
  const plataforma = `${{ win32: "windows", darwin: "darwin", linux: "linux" }[process.platform as string] ?? process.platform}-${{ x64: "x64", arm64: "arm64" }[process.arch as string] ?? process.arch}`;
  const dir = join(RAIZ, "node_modules", "@embedded-postgres", plataforma, "native", "bin");
  if (!existsSync(dir)) {
    console.error(`ERROR: no encuentro los binarios embebidos en ${dir}.`);
    console.error("¿Corriste npm install? (embedded-postgres es devDependency)");
    process.exit(1);
  }
  return dir;
}

const exe = (nombre: string) =>
  join(binDir(), process.platform === "win32" ? `${nombre}.exe` : nombre);

function urlDe(db: string): string {
  return `postgresql://postgres:postgres@localhost:${PUERTO}/${db}`;
}

function estaCorriendo(): boolean {
  const r = spawnSync(exe("pg_ctl"), ["status", "-D", DATA], { encoding: "utf8" });
  return r.status === 0;
}

function up(): void {
  if (!existsSync(DATA)) {
    console.log("· initdb (primera vez)…");
    mkdirSync(join(RAIZ, ".local-db"), { recursive: true });
    execFileSync(exe("initdb"), ["-D", DATA, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], {
      stdio: "pipe",
    });
    // Solo loopback: esta base jamás se expone fuera de la máquina.
    writeFileSync(join(DATA, "postgresql.auto.conf"), `listen_addresses = '127.0.0.1'\nport = ${PUERTO}\n`, {
      flag: "a",
    });
  }
  if (estaCorriendo()) {
    console.log(`✓ ya estaba corriendo en localhost:${PUERTO}`);
    return;
  }
  // ⚠ stdio "ignore" A PROPÓSITO: el postgres daemonizado HEREDA los pipes de pg_ctl; con
  //   "pipe", execFileSync espera un EOF que nunca llega y el comando cuelga para siempre
  //   (mordido en el primer arranque, 2026-08-01). El output real ya va al logfile (-l).
  execFileSync(exe("pg_ctl"), ["start", "-w", "-t", "30", "-D", DATA, "-l", LOG, "-o", `-p ${PUERTO}`], {
    stdio: "ignore",
  });
  console.log(`✓ Postgres local arriba en localhost:${PUERTO} (log: .local-db/postgres.log)`);
}

function down(): void {
  if (!estaCorriendo()) {
    console.log("· no estaba corriendo.");
    return;
  }
  execFileSync(exe("pg_ctl"), ["stop", "-w", "-t", "30", "-D", DATA, "-m", "fast"], { stdio: "ignore" });
  console.log("✓ apagado.");
}

async function ensureDatabases(): Promise<void> {
  const admin = new Client({ connectionString: urlDe("postgres") });
  await admin.connect();
  for (const db of BASES) {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE ${db}`);
      console.log(`· creada ${db}`);
    }
  }
  await admin.end();
}

async function aplicarSql(db: string, rutaRelativa: string): Promise<void> {
  const sql = readFileSync(join(RAIZ, rutaRelativa), "utf8");
  const c = new Client({ connectionString: urlDe(db) });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function bootstrap(): Promise<void> {
  if (!estaCorriendo()) up();
  await ensureDatabases();
  for (const db of BASES) {
    console.log(`\n── bootstrap de ${db} ──`);
    // 0_init vía migrate deploy: usa el baseline REAL y deja _prisma_migrations coherente.
    // La URL entra por env al proceso hijo (prisma.config.ts la lee de DATABASE_URL); el
    // guard del config permite localhost sin ALLOW_PROD_WRITE.
    const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: urlDe(db) },
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) {
      console.error(r.stdout);
      console.error(r.stderr);
      throw new Error(`migrate deploy falló para ${db}`);
    }
    const resumen = (r.stdout.match(/^.*(migration|applied|up to date).*$/gim) ?? []).slice(-2).join(" · ");
    console.log(`· migrate deploy ✓ ${resumen ? `(${resumen.trim()})` : ""}`);
    await aplicarSql(db, "prisma/migrations/0_init/after.sql");
    console.log("· after.sql ✓ (CHECK logoScale; pgvector omitido si no está)");
    await aplicarSql(db, "prisma/policies.sql");
    console.log("· policies.sql ✓ (RLS + policies)");
  }
  console.log("\n✓ bootstrap completo. URLs:");
  for (const db of BASES) console.log(`  ${db}: ${urlDe(db)}`);
}

// ── seed: catálogo + fixture contra nexus_local ────────────────────────────────
// Lista EXPLÍCITA a propósito (no un glob): un one-off nuevo en scripts/ no debe
// colarse al bootstrap local en silencio. Los demos de cobranza NO están acá —
// son opcionales y se corren a mano (seed-cobranza-demo → -historia). El orden
// importa donde hay dependencias (team antes que app-users; el fixture al final).
const CATALOGO_SEEDS = [
  // Núcleo: agentes + tags + conocimiento base
  "prisma/seed.ts",
  "prisma/seed-tags.ts",
  "prisma/seed-knowledge.ts",
  // Equipo (roster FICTICIO — los correos reales no van al repo) + identidades + permisos
  "scripts/seed-team.ts",
  "scripts/seed-app-users.ts",
  "scripts/seed-role-permissions.ts",
  "scripts/seed-session-categories.ts",
  // Agentes por módulo (prompts en DB, upserts idempotentes)
  "scripts/seed-analysis-agents.ts",
  "scripts/seed-canvas-agents.ts",
  "scripts/seed-handoff-agent.ts",
  "scripts/seed-kickoff-agent.ts",
  "scripts/seed-diagnostico-agent.ts",
  "scripts/seed-planificacion-agent.ts",
  "scripts/seed-implementacion-agent.ts",
  "scripts/seed-desarrollo-agent.ts",
  "scripts/seed-exploracion-agent.ts",
  "scripts/seed-post-session-agent.ts",
  "scripts/seed-participants-analyzer.ts",
  "scripts/seed-session-project-classifier.ts",
  "scripts/seed-timeline-detail-agent.ts",
  "scripts/seed-timeline-progress-agent.ts",
  "scripts/seed-roles-assist-agent.ts",
  // Conocimiento versionado en el repo
  "scripts/seed-breeze-knowledge.ts",
  "scripts/seed-escala-rendimiento.ts",
  "scripts/seed-escala-criterios.ts",
  "scripts/seed-caminos-opuestos.ts",
  // Marketing (settings + ICP + personas)
  "scripts/seed-marketing-module.ts",
  "scripts/seed-buyer-personas.ts",
  // El mundo ficticio fx- (clientes/proyectos/sesiones/cobranza/roles) — SIEMPRE último
  "scripts/seed-fixture.ts",
];

async function seed(): Promise<void> {
  if (!estaCorriendo()) up();
  await ensureDatabases();
  const url = urlDe("nexus_local"); // nexus_test se trunca por test — no se siembra
  const fallidos: string[] = [];
  for (const script of CATALOGO_SEEDS) {
    console.log(`\n━━ ${script} ━━`);
    // "--apply" para los dry-run-first; los que no lo parsean lo ignoran. En
    // localhost el guard no exige ALLOW_PROD_WRITE (a propósito).
    const r = spawnSync("npx", ["tsx", script, "--apply"], {
      cwd: RAIZ,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) fallidos.push(script);
  }
  console.log("\n──────────────────────────────────");
  if (fallidos.length) {
    console.error(`✗ seed terminó con ${fallidos.length} fallo(s):`);
    for (const f of fallidos) console.error(`   · ${f}`);
    process.exit(1);
  }
  console.log(`✓ seed completo: ${CATALOGO_SEEDS.length} scripts contra nexus_local.`);
  console.log("  Demos opcionales de Cobranza: npx tsx scripts/seed-cobranza-demo.ts --apply → -historia.");
}

/**
 * `acceso` — copia el roster INTERNO real (TeamMember + AppUser INTERNAL) de prod a la local.
 *
 * Por qué hace falta: Supabase Auth es UNO SOLO (prod y local comparten proyecto de auth; lo
 * único que cambia es dónde vive la DATA). Al entrar a la instancia local el login de Google
 * anda y devuelve tu correo REAL, pero `requireUser` busca `AppUser` POR EMAIL y la local solo
 * tiene los ficticios del fixture → "Usuario autenticado pero sin AppUser". Esto lo cierra.
 *
 * Va SEPARADO de `seed` a propósito: `seed` es el mundo ficticio y funciona sin acceso a prod;
 * esto LEE de prod (solo lectura) y por eso es una decisión aparte y explícita.
 */
async function acceso(): Promise<void> {
  const urlProd = process.env.DATABASE_URL;
  if (!urlProd || !esHostProduccion(urlProd)) {
    console.error(`⛔ La FUENTE debe ser producción. DATABASE_URL actual: ${describirDestino(urlProd)}`);
    console.error("   Corré este comando con tu .env normal (el que apunta a prod).");
    process.exit(1);
  }
  if (!estaCorriendo()) up();
  await ensureDatabases();

  const destinoUrl = urlDe("nexus_local");
  assertLocalWriteOnly(destinoUrl, "db:local acceso (destino)");

  const origen = createScriptDbFor(urlProd, "origen (prod, solo lectura)");
  const destino = createScriptDbFor(destinoUrl, "destino (local)");
  try {
    const r = await copiarRosterInterno(origen.prisma, destino.prisma);
    console.log(`\n✓ Roster interno copiado: ${r.teamMembers} personas · ${r.appUsers} accesos.`);
    console.log("  Ya podés entrar a http://localhost:3005 con tu cuenta de Google de siempre.");
  } finally {
    await origen.close();
    await destino.close();
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "status";
  switch (cmd) {
    case "up":
      up();
      await ensureDatabases();
      break;
    case "down":
      down();
      break;
    case "status":
      console.log(estaCorriendo() ? `✓ corriendo en localhost:${PUERTO}` : "· apagado");
      break;
    case "bootstrap":
      await bootstrap();
      break;
    case "seed":
      await seed();
      break;
    case "acceso":
      await acceso();
      break;
    case "reset":
      down();
      rmSync(join(RAIZ, ".local-db"), { recursive: true, force: true });
      console.log("· datos borrados.");
      up();
      await bootstrap();
      break;
    case "url":
      for (const db of BASES) console.log(`${db}: ${urlDe(db)}`);
      break;
    default:
      console.error(`Comando desconocido: ${cmd}. Usá up | down | status | bootstrap | seed | acceso | reset | url`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
