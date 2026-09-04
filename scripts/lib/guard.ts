/**
 * scripts/lib/guard.ts — EL guard anti-escritura-accidental-a-producción.
 *
 * Contexto: hay UNA sola Supabase y `DATABASE_URL` apunta a PRODUCCIÓN (invariante #3 de
 * CLAUDE.md). Cualquier `npx tsx scripts/... --apply` corrido por reflejo escribe sobre datos
 * reales. Este módulo es la única palanca que convierte ese reflejo en una decisión:
 *
 *   - SIEMPRE imprime a stderr contra qué host se va a escribir (nunca credenciales).
 *   - Si el host es Supabase y NO está `ALLOW_PROD_WRITE=1`, ABORTA antes de escribir.
 *   - Con `--apply`, RESPALDA con pg_dump las tablas que el script declara ANTES de habilitar
 *     la escritura, y si el respaldo falla no hay escritura (B-06, 2026-09-04).
 *
 * Cómo autorizar una escritura a prod (decisión explícita, por comando):
 *   bash:        ALLOW_PROD_WRITE=1 npx tsx scripts/lo-que-sea.ts --apply
 *   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/lo-que-sea.ts --apply
 *
 * ⚠ CERO DEPENDENCIAS a propósito (ni pg, ni @prisma/client, ni dotenv; solo core de Node): lo importa
 * `prisma.config.ts`, que ejecuta el CLI de Prisma en TODOS sus comandos — arrastrar el client
 * acá sería una dependencia circular con el propio CLI. La carga de .env es responsabilidad
 * del caller (prisma.config.ts y scripts/lib/db.ts ya hacen `import "dotenv/config"`).
 *
 * Los one-liners `npx tsx -e` (el camino de los .sql con ALTER TYPE ... ADD VALUE) no pasan
 * por ningún archivo del repo: ahí el ritual es llamar `assertProdWriteAllowed()` A MANO al
 * principio del one-liner. Está escrito en ARCHITECTURE (Parte 0 · cap. D).
 *
 * INV12 (check-invariants) exige que todo script con `--apply` importe este módulo.
 */

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

export type VeredictoEscritura = {
  permitido: boolean;
  destino: string;
  motivo: string;
};

/** Host:puerto de la connection string — JAMÁS usuario/contraseña. */
export function describirDestino(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(DATABASE_URL ilegible)";
  }
}

/**
 * ¿La URL apunta a producción? Matchea `*.supabase.co` (conexión directa, la actual) Y
 * `*.supabase.com` (los hosts del pooler son `*.pooler.supabase.com` — cubre un cambio
 * futuro). URL ausente o malformada → true: ante la duda, es prod (fail-closed).
 */
export function esHostProduccion(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return /\.supabase\.(co|com)$/i.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

/** La decisión, como función PURA (testeable sin process.exit — lib/db/guard.test.ts). */
export function veredictoEscritura(
  url: string | undefined,
  env: Record<string, string | undefined>,
): VeredictoEscritura {
  const destino = describirDestino(url);
  if (!url) {
    return { permitido: false, destino, motivo: "falta DATABASE_URL en el entorno (.env)" };
  }
  if (!esHostProduccion(url)) {
    return { permitido: true, destino, motivo: "host no-productivo" };
  }
  if (env.ALLOW_PROD_WRITE === "1") {
    return { permitido: true, destino, motivo: "prod autorizado por ALLOW_PROD_WRITE=1" };
  }
  return {
    permitido: false,
    destino,
    motivo: "el host es PRODUCCIÓN y no está ALLOW_PROD_WRITE=1",
  };
}

/** Línea informativa única, a stderr (no ensucia stdout de los dry-run). */
export function imprimirDestino(etiqueta = "db"): void {
  console.error(`[${etiqueta}] destino: ${describirDestino(process.env.DATABASE_URL)}`);
}

/**
 * El gate duro: imprime el destino y, si la escritura no está permitida, aborta con
 * instrucciones. Llamalo ANTES de la primera escritura (resolverApply() lo hace solo).
 */
export function assertProdWriteAllowed(contexto = "escritura"): void {
  abortarSiAllowProdWriteFijo();
  const v = veredictoEscritura(process.env.DATABASE_URL, process.env);
  console.error(`[guard] ${contexto} → destino: ${v.destino}`);
  if (v.permitido) return;
  console.error(`\n⛔ ABORTADO: ${v.motivo}.`);
  console.error("   Esa base es la que usan los clientes AHORA. Si la escritura es intencional:");
  console.error("     bash:        ALLOW_PROD_WRITE=1 <mismo comando>");
  console.error('     PowerShell:  $env:ALLOW_PROD_WRITE="1"; <mismo comando>');
  process.exit(1);
}

// ── B-06 · Respaldo obligatorio antes de todo --apply ───────────────────────────────────────
//
// Supabase restaura la base ENTERA o nada (RUNBOOK «Respaldo y restauración»). Un UPDATE
// equivocado sobre una tabla no tenía vuelta atrás parcial: dos scripts volcaban a mano lo que
// tocaban (purge-future-sessions, reparar-rempro) y los otros ~90 escribían sin red. Ahora el
// guard respalda con pg_dump las `tablas` que el script declara, a
// `backups/<AAAA-MM-DD>-<script>/<Tabla>.<HHMMSS>.sql`, ANTES de devolver `true`.

/** Un nombre de tabla de Prisma: identificador simple. Es lo único de acá que llega a la línea de comandos. */
const NOMBRE_DE_TABLA = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ArchivoDeRespaldo = { tabla: string; ruta: string };
export type PlanDeRespaldo = { dir: string; archivos: ArchivoDeRespaldo[] };
export type ResultadoPgDump = { status: number | null; detalle: string };
export type EjecutorDePgDump = (args: string[]) => ResultadoPgDump;
export type ResultadoDeRespaldo =
  | { ok: true; plan: PlanDeRespaldo }
  | { ok: false; plan: PlanDeRespaldo; motivo: string };

/** `AAAA-MM-DD` y `HHMMSS` en hora LOCAL: es la fecha que la persona ve en el explorador. */
function fechaYHora(ahora: Date): { fecha: string; hora: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`,
    hora: `${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`,
  };
}

/** El script que corre (`scripts/foo.ts` → `foo`), para nombrar la carpeta del respaldo. Puro. */
export function nombreDelScript(argv1 = process.argv[1] ?? ""): string {
  return basename(argv1).replace(/\.(ts|js|mjs|cjs)$/, "") || "script";
}

/**
 * Dónde va cada tabla: `<raiz>/<AAAA-MM-DD>-<script>/<Tabla>.<HHMMSS>.sql`. Puro. La hora en el
 * nombre hace que dos corridas del mismo día no se pisen. Un nombre que no sea un identificador
 * simple se rechaza (y una lista vacía también: «respaldar nada» no es respaldar).
 */
export function planDeRespaldo(
  tablas: string[],
  opts: { script: string; ahora: Date; raiz?: string },
): PlanDeRespaldo {
  const unicas = [...new Set(tablas)];
  if (unicas.length === 0) throw new Error("planDeRespaldo: la lista de tablas está vacía");
  for (const t of unicas) {
    if (!NOMBRE_DE_TABLA.test(t)) throw new Error(`planDeRespaldo: «${t}» no es un nombre de tabla válido`);
  }
  const { fecha, hora } = fechaYHora(opts.ahora);
  const dir = join(opts.raiz ?? "backups", `${fecha}-${opts.script}`);
  return { dir, archivos: unicas.map((tabla) => ({ tabla, ruta: join(dir, `${tabla}.${hora}.sql`) })) };
}

/**
 * La URL que recibe pg_dump: libpq rechaza parámetros que no conoce, y las URLs de Supabase suelen
 * traer `pgbouncer=true`, `connection_limit=…` o `schema=…` (son de Prisma). Se conserva solo
 * `sslmode`. Puro. Las credenciales SÍ viajan (pg_dump las necesita): por eso esta URL jamás se
 * imprime — lo que se imprime es `describirDestino`.
 */
export function urlParaPgDump(url: string): string {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  u.search = "";
  if (sslmode) u.searchParams.set("sslmode", sslmode);
  return u.toString();
}

/**
 * Los argumentos de pg_dump para UNA tabla, puro: solo datos, formato plano, sin dueños ni privilegios
 * (Supabase los tiene distintos), y la tabla entre comillas dobles porque los nombres de Prisma son
 * PascalCase y Postgres los cita así. Restaurar una tabla:
 *   psql "$DATABASE_URL" -f backups/<fecha>-<script>/<Tabla>.<hora>.sql
 * (el COPY AGREGA filas: sobre una tabla que todavía tiene datos, primero decidir qué hacer con ellos).
 */
export function argumentosPgDump(url: string, tabla: string, ruta: string): string[] {
  return [
    `--dbname=${urlParaPgDump(url)}`,
    "--data-only",
    "--format=plain",
    "--no-owner",
    "--no-privileges",
    `--table="${tabla}"`,
    `--file=${ruta}`,
  ];
}

/** El ejecutor real: `pg_dump` del PATH. Que no esté instalado vuelve como detalle, no como excepción. */
export const pgDumpReal: EjecutorDePgDump = (args) => {
  const r = spawnSync("pg_dump", args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.error) {
    const codigo = (r.error as { code?: string }).code;
    return {
      status: null,
      detalle: codigo === "ENOENT" ? "pg_dump no está instalado o no está en el PATH" : r.error.message,
    };
  }
  const stderr = (r.stderr ?? "").trim();
  return { status: r.status, detalle: stderr.split(/\r?\n/).slice(-3).join(" · ") };
};

/**
 * Corre pg_dump por tabla y verifica que cada archivo exista y no esté vacío. Falla en la primera
 * tabla que no se pudo respaldar: un respaldo a medias no es un respaldo. No imprime la URL.
 */
export function respaldarTablas(
  url: string,
  plan: PlanDeRespaldo,
  pgDump: EjecutorDePgDump = pgDumpReal,
): ResultadoDeRespaldo {
  mkdirSync(plan.dir, { recursive: true });
  for (const { tabla, ruta } of plan.archivos) {
    const r = pgDump(argumentosPgDump(url, tabla, ruta));
    if (r.status !== 0) {
      return {
        ok: false,
        plan,
        motivo: `pg_dump de «${tabla}» terminó con ${r.status ?? "error"}: ${r.detalle || "sin detalle"}`,
      };
    }
    let bytes = 0;
    try {
      bytes = statSync(ruta).size;
    } catch {
      bytes = 0;
    }
    if (bytes === 0) return { ok: false, plan, motivo: `el respaldo de «${tabla}» quedó vacío (${ruta})` };
  }
  return { ok: true, plan };
}

export type OpcionesDeApply = {
  /** Las tablas que el script ESCRIBE. Con `--apply` se respaldan ANTES de devolver `true`. */
  tablas?: string[];
  /** Solo para tests: el ejecutor de pg_dump, la carpeta raíz de los respaldos y el reloj. */
  pgDump?: EjecutorDePgDump;
  raiz?: string;
  ahora?: Date;
};

/**
 * Reemplazo 1:1 del patrón `const APPLY = process.argv.includes("--apply")`: mismo booleano, pero
 * si es --apply (1) el guard corre ANTES de devolver y (2) desde B-06 las `tablas` que el script
 * declara se respaldan — y si el respaldo falla, NO hay escritura:
 *
 *   const APPLY = resolverApply({ tablas: ["SessionProject"] });
 *
 * Sin `tablas` el script escribe sin red y lo dice a stderr; `lib/db/guard-de-escritura.test.ts`
 * congela cuáles son (la lista solo encoge). `SIN_RESPALDO=1` salta el respaldo POR COMANDO: una
 * decisión explícita, como ALLOW_PROD_WRITE, nunca fija en el .env.
 */
export function resolverApply(opts: OpcionesDeApply = {}): boolean {
  const apply = process.argv.includes("--apply");
  if (!apply) return false;
  assertProdWriteAllowed("--apply");
  const tablas = opts.tablas ?? [];
  if (tablas.length === 0) {
    console.error(
      "[guard] ⚠ sin respaldo automático: este script no declara `tablas` (B-06). Si algo sale mal, Supabase solo restaura la base entera.",
    );
    return true;
  }
  if (process.env.SIN_RESPALDO === "1") {
    console.error(`[guard] ⚠ SIN_RESPALDO=1: se escribe ${tablas.join(", ")} sin respaldar. Decisión tuya.`);
    return true;
  }
  const plan = planDeRespaldo(tablas, { script: nombreDelScript(), ahora: opts.ahora ?? new Date(), raiz: opts.raiz });
  console.error(`[guard] respaldando ${tablas.join(", ")} → ${plan.dir}`);
  const r = respaldarTablas(process.env.DATABASE_URL ?? "", plan, opts.pgDump);
  if (!r.ok) {
    console.error(`\n⛔ ABORTADO: sin respaldo no hay escritura. ${r.motivo}.`);
    console.error("   Instalá las herramientas cliente de PostgreSQL (pg_dump en el PATH) y volvé a correr.");
    console.error("   Para escribir SIN respaldo, a sabiendas: SIN_RESPALDO=1 <mismo comando>.");
    process.exit(1);
  }
  console.error(`[guard] respaldo OK: ${r.plan.archivos.map((a) => a.ruta).join(", ")}`);
  return true;
}

// Hosts LOCALES reconocidos (loopback en sus tres formas). Vive acá y no en cada script
// para que "qué cuenta como local" tenga una sola definición.
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Aborta si `url` NO es un host local — SIN excepción, ni con `ALLOW_PROD_WRITE=1`. Para
 * escrituras que JAMÁS deben tocar la base compartida (datos ficticios del fixture, copias
 * de contexto real para pruebas): a diferencia de `assertProdWriteAllowed`, acá no existe
 * la salida de autorizar prod — es un candado, no un semáforo. `contexto` sale en el mensaje.
 */
export function assertLocalWriteOnly(url: string | undefined, contexto = "escritura"): void {
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    host = "";
  }
  if (!url || esHostProduccion(url) || !HOSTS_LOCALES.has(host)) {
    console.error(`⛔ ${contexto} SOLO corre contra una base LOCAL (localhost). Destino: ${describirDestino(url)}`);
    console.error("   Este script NO acepta ALLOW_PROD_WRITE — no hay forma de autorizarlo contra prod.");
    process.exit(1);
  }
  console.error(`[db] destino: ${describirDestino(url)} (local ✓)`);
}

/**
 * `ALLOW_PROD_WRITE` se autoriza POR COMANDO. Fija en el `.env` del repo deja de ser una decisión
 * y pasa a ser un reflejo: todo `--apply` corrido por costumbre escribe en producción sin que
 * nadie lo haya pedido (B-01, auditoría 2026-09-03). `texto` es el contenido del .env; una línea
 * comentada no cuenta. Puro: lib/db/guard.test.ts.
 */
export function tieneAllowProdWriteFijo(texto: string): boolean {
  return /^\s*(?:export\s+)?ALLOW_PROD_WRITE\s*=/m.test(texto);
}

/** Lee `.env` del cwd (sin dotenv: cero dependencias) y aborta si trae la variable fija. */
export function abortarSiAllowProdWriteFijo(dir = process.cwd()): void {
  let texto = "";
  try {
    texto = readFileSync(join(dir, ".env"), "utf8");
  } catch {
    return; // sin .env (Docker, CI): nada que revisar
  }
  if (!tieneAllowProdWriteFijo(texto)) return;
  console.error("⛔ ABORTADO: ALLOW_PROD_WRITE está FIJA en el .env del repo.");
  console.error("   Se autoriza por comando, nunca en el archivo: sacala del .env y volvé a correr.");
  process.exit(1);
}

export type VeredictoPrismaCli = VeredictoEscritura & { esEscritura: boolean; esDestructivo: boolean };

/**
 * La decisión del CLI de Prisma, PURA (lib/db/guard.test.ts). Dos listas:
 *   · ESCRITURA (db execute/push/seed, migrate resolve/deploy/reset/dev): contra Supabase exige
 *     ALLOW_PROD_WRITE=1 — el semáforo de siempre.
 *   · DESTRUCTIVA (db push, migrate reset, migrate dev): contra Supabase NO se destraba con nada
 *     (B-01, auditoría 2026-09-03). `db push` ya se llevó `RoleProfile` una vez (RUNBOOK inv. #2)
 *     y con dos PCs sobre la misma base dropea columnas ajenas; `migrate reset` borra la base;
 *     `migrate dev` genera y aplica migraciones sobre datos reales. Es el patrón de
 *     `assertLocalWriteOnly`: un candado, no un semáforo. Contra un host local siguen valiendo.
 */
export function veredictoPrismaCli(
  invocacion: string,
  url: string | undefined,
  env: Record<string, string | undefined>,
): VeredictoPrismaCli {
  const esEscritura =
    /\bdb\s+(execute|push|seed)\b/.test(invocacion) ||
    /\bmigrate\s+(resolve|deploy|reset|dev)\b/.test(invocacion);
  const esDestructivo = /\bdb\s+push\b/.test(invocacion) || /\bmigrate\s+(reset|dev)\b/.test(invocacion);
  if (!esEscritura) {
    return { esEscritura, esDestructivo, permitido: true, destino: describirDestino(url), motivo: "no es un comando de escritura" };
  }
  if (esDestructivo && esHostProduccion(url)) {
    return {
      esEscritura,
      esDestructivo,
      permitido: false,
      destino: describirDestino(url),
      motivo:
        "db push / migrate reset / migrate dev están PROHIBIDOS contra Supabase y no se destraban con " +
        "ALLOW_PROD_WRITE (RUNBOOK inv. #2: dos PCs sobre la misma base)",
    };
  }
  return { esEscritura, esDestructivo, ...veredictoEscritura(url, env) };
}

/**
 * Gate para el CLI de Prisma — lo llama `prisma.config.ts`, que se ejecuta en TODOS los
 * comandos (`generate`, `validate`, `db execute`, `migrate ...`). Por eso:
 *
 *   - LISTA POSITIVA de comandos de escritura; todo lo demás es no-op ABSOLUTO. Un falso
 *     positivo acá rompería `prisma generate` (que corre en el build de Docker y en CI) —
 *     fail-open deliberado para comandos desconocidos: la capa de scripts tiene su propio guard.
 *   - En Prisma 7 ningún comando de escritura acepta URL por flag (db execute solo tiene
 *     --file/--stdin): la URL sale SOLO del config → este es el único chokepoint del CLI.
 *   - Lo DESTRUCTIVO (db push, migrate reset/dev) contra Supabase no tiene llave: ver
 *     `veredictoPrismaCli`.
 *
 * Lanza (en vez de process.exit) para que el CLI lo reporte como error del config.
 */
export function guardPrismaCli(url: string | undefined): void {
  const v = veredictoPrismaCli(process.argv.join(" "), url, process.env);
  if (!v.esEscritura) return;
  abortarSiAllowProdWriteFijo();
  console.error(`[guard] prisma (escritura) → destino: ${v.destino}`);
  if (v.permitido) return;
  throw new Error(
    v.esDestructivo
      ? `⛔ ${v.motivo}. Destino: ${v.destino}. Contra la base compartida el camino es SQL aditivo con \`db execute\` (RUNBOOK).`
      : `⛔ Comando de ESCRITURA de Prisma contra ${v.destino}: ${v.motivo}. ` +
        `Si es intencional: ALLOW_PROD_WRITE=1 (bash) / $env:ALLOW_PROD_WRITE="1" (PowerShell).`,
  );
}
