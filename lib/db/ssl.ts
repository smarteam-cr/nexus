/**
 * lib/db/ssl.ts — SSL condicional por HOST para las conexiones pg.
 *
 * Hasta el 2026-08-01 los dos pools (lib/db/prisma.ts y scripts/lib/db.ts) hardcodeaban
 * `ssl: { rejectUnauthorized: false }` — correcto contra Supabase, pero el Postgres LOCAL
 * embebido (F1: `npm run db:local`) no habla TLS y node-postgres revienta con
 * "The server does not support SSL connections" si le mandás el objeto ssl igual.
 *
 * Regla: localhost/127.0.0.1 → sin SSL; cualquier otro host → SSL como siempre.
 * URL ilegible → SSL (el lado seguro: si es basura igual no conecta).
 */
export function sslParaConexion(
  url: string | undefined,
): { rejectUnauthorized: boolean } | undefined {
  try {
    const host = new URL(url ?? "").hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  } catch {
    // ilegible → tratamos como remoto
  }
  return { rejectUnauthorized: false };
}
