/**
 * lib/db/retry.ts
 *
 * Reintento con backoff para errores TRANSITORIOS de conexión a la DB (presión del pool contra el
 * pooler de Supabase). Bajo carga, la vista de proyecto dispara una ráfaga de reads en paralelo; si
 * el pool se satura, pg tira "Connection terminated"/"Timed out fetching a connection"/P2028. Esos
 * fallos son RETRIABLES: un pico breve se auto-cura reintentando tras un backoff corto, en vez de
 * 500ear (que es lo que ve el usuario como "INTERNAL_ERROR" / "No se pudo cargar…").
 *
 * SOLO reintenta errores de conexión/pool — nunca errores de lógica/validación (esos se propagan tal cual).
 */

const TRANSIENT_MARKERS = [
  "p2028", // Prisma: transaction API error (timeout adquiriendo conexión)
  "connection terminated",
  "timed out fetching a new connection",
  "connection pool",
  "max client connections",
  "too many connections",
  "econnreset",
  "server closed the connection",
];

export function isTransientDbError(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2028" || code === "ECONNRESET") return true;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return TRANSIENT_MARKERS.some((m) => msg.includes(m));
}

/**
 * Corre `fn` y, si falla con un error transitorio de conexión, reintenta hasta `retries` veces con
 * backoff exponencial (baseMs · 2^intento). Errores NO transitorios se propagan de inmediato.
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 150;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isTransientDbError(e)) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
  throw lastErr;
}
