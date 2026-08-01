/**
 * scripts/lib/guard.ts — EL guard anti-escritura-accidental-a-producción.
 *
 * Contexto: hay UNA sola Supabase y `DATABASE_URL` apunta a PRODUCCIÓN (invariante #3 de
 * CLAUDE.md). Cualquier `npx tsx scripts/... --apply` corrido por reflejo escribe sobre datos
 * reales. Este módulo es la única palanca que convierte ese reflejo en una decisión:
 *
 *   - SIEMPRE imprime a stderr contra qué host se va a escribir (nunca credenciales).
 *   - Si el host es Supabase y NO está `ALLOW_PROD_WRITE=1`, ABORTA antes de escribir.
 *
 * Cómo autorizar una escritura a prod (decisión explícita, por comando):
 *   bash:        ALLOW_PROD_WRITE=1 npx tsx scripts/lo-que-sea.ts --apply
 *   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/lo-que-sea.ts --apply
 *
 * ⚠ CERO DEPENDENCIAS a propósito (ni pg, ni @prisma/client, ni dotenv): lo importa
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
  const v = veredictoEscritura(process.env.DATABASE_URL, process.env);
  console.error(`[guard] ${contexto} → destino: ${v.destino}`);
  if (v.permitido) return;
  console.error(`\n⛔ ABORTADO: ${v.motivo}.`);
  console.error("   Esa base es la que usan los clientes AHORA. Si la escritura es intencional:");
  console.error("     bash:        ALLOW_PROD_WRITE=1 <mismo comando>");
  console.error('     PowerShell:  $env:ALLOW_PROD_WRITE="1"; <mismo comando>');
  process.exit(1);
}

/**
 * Reemplazo 1:1 del patrón `const APPLY = process.argv.includes("--apply")`:
 * mismo booleano, pero si es --apply el guard corre ANTES de devolver.
 */
export function resolverApply(): boolean {
  const apply = process.argv.includes("--apply");
  if (apply) assertProdWriteAllowed("--apply");
  return apply;
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
 * Gate para el CLI de Prisma — lo llama `prisma.config.ts`, que se ejecuta en TODOS los
 * comandos (`generate`, `validate`, `db execute`, `migrate ...`). Por eso:
 *
 *   - LISTA POSITIVA de comandos de escritura; todo lo demás es no-op ABSOLUTO. Un falso
 *     positivo acá rompería `prisma generate` (que corre en el build de Docker y en CI) —
 *     fail-open deliberado para comandos desconocidos: la capa de scripts tiene su propio guard.
 *   - En Prisma 7 ningún comando de escritura acepta URL por flag (db execute solo tiene
 *     --file/--stdin): la URL sale SOLO del config → este es el único chokepoint del CLI.
 *
 * Lanza (en vez de process.exit) para que el CLI lo reporte como error del config.
 */
export function guardPrismaCli(url: string | undefined): void {
  const invocacion = process.argv.join(" ");
  const esEscritura =
    /\bdb\s+(execute|push|seed)\b/.test(invocacion) ||
    /\bmigrate\s+(resolve|deploy|reset|dev)\b/.test(invocacion);
  if (!esEscritura) return;

  const v = veredictoEscritura(url, process.env);
  console.error(`[guard] prisma (escritura) → destino: ${v.destino}`);
  if (v.permitido) return;
  throw new Error(
    `⛔ Comando de ESCRITURA de Prisma contra ${v.destino}: ${v.motivo}. ` +
      `Si es intencional: ALLOW_PROD_WRITE=1 (bash) / $env:ALLOW_PROD_WRITE="1" (PowerShell).`,
  );
}
