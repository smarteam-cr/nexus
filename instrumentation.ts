/**
 * instrumentation.ts — Next.js lo ejecuta UNA vez en el boot del server.
 * Único uso hoy: arrancar el cron del módulo Contenido (viernes 6:00 CR).
 *
 * Gates:
 *  - NEXT_RUNTIME nodejs (no edge).
 *  - CRON_ENABLED="1" EXPLÍCITA (la setea docker-compose en PROD; dev NO la
 *    tiene → el intervalo nunca arranca localmente, aunque instrumentation
 *    corre también en dev).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.CRON_ENABLED !== "1") return;
  const { startMarketingCron } = await import("@/lib/marketing/cron");
  startMarketingCron();
}
