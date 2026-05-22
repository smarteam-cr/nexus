/**
 * scripts/backfill-meet.ts
 *
 * Backfill one-off de sesiones de Google Meet.
 * Útil después de extender DAYS_BACK (90 → 365) para traer eventos
 * históricos que el sync regular no incluía.
 *
 * Por defecto sincroniza 365 días hacia atrás (config en meet-sync.ts).
 * Para forzar un rango distinto, usar la env var GOOGLE_MEET_DAYS_BACK
 * o pasar argumento posicional:
 *
 *   npx tsx --env-file=.env scripts/backfill-meet.ts
 *   npx tsx --env-file=.env scripts/backfill-meet.ts 730    # 2 años
 *
 * IMPORTANTE: este sync impersona cada usuario del dominio Google Workspace
 * y pagina hasta MAX_PAGES_PER_USER (definido en meet-sync.ts). Para portales
 * con muchos usuarios o eventos, puede tardar varios minutos.
 */

import "dotenv/config";
import { syncGoogleMeetSessions } from "../lib/google/meet-sync";

async function main() {
  // Argumento posicional opcional para daysBack
  const argDays = process.argv[2] ? Number(process.argv[2]) : undefined;

  const daysBack = argDays ?? (process.env.GOOGLE_MEET_DAYS_BACK ? Number(process.env.GOOGLE_MEET_DAYS_BACK) : 365);

  if (!Number.isFinite(daysBack) || daysBack <= 0) {
    console.error(`❌ daysBack inválido: ${daysBack}`);
    process.exit(1);
  }

  console.log(`🔄 Backfill Google Meet — daysBack=${daysBack}`);
  console.log(`   (esto puede tardar varios minutos según cantidad de usuarios + eventos)\n`);

  const t0 = Date.now();
  const result = await syncGoogleMeetSessions({ daysBack });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✅ Backfill completado en ${elapsedSec}s`);
  console.log(`   · Sesiones nuevas insertadas:  ${result.synced}`);
  console.log(`   · Sesiones ya existentes:      ${result.alreadyExisted}`);
  console.log(`   · Total procesadas:            ${result.total}`);
}

main().catch((err) => {
  console.error("❌ Error en backfill:", err);
  process.exit(1);
});
