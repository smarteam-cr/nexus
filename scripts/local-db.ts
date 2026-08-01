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
      console.error(`Comando desconocido: ${cmd}. Usá up | down | status | bootstrap | reset | url`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
