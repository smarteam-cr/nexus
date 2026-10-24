/**
 * scripts/backfill-meet.ts
 *
 * Backfill one-off de sesiones de Google Meet.
 * Útil después de extender DAYS_BACK (90 → 365) para traer eventos
 * históricos que el sync regular no incluía.
 *
 * Por defecto sincroniza 365 días hacia atrás (default de ESTE script: la sync automática
 * mira solo 30 desde el 2026-09-21, ver `diasHaciaAtras` en lib/google/meet-sync-cambios.ts).
 * ⚠ Escribe en la base compartida, que es la de producción.
 * Para forzar un rango distinto, usar la env var GOOGLE_MEET_DAYS_BACK
 * o pasar argumento posicional:
 *
 *   npx tsx --env-file=.env scripts/backfill-meet.ts
 *   npx tsx --env-file=.env scripts/backfill-meet.ts 730    # 2 años
 *
 * U1 (2026-10-25): no marca canceladas salvo con `--con-canceladas` (sacaría de las lecturas las canceladas sin texto
 * de todo el rango sin que nadie lo haya mirado antes). Los invitados sí los escribe (solo suma lo que falta). Si
 * Google no responde, termina con error y no con «completado».
 *
 * IMPORTANTE: este sync impersona cada usuario del dominio Google Workspace
 * y pagina hasta MAX_PAGES_PER_USER (definido en meet-sync.ts). Para portales
 * con muchos usuarios o eventos, puede tardar varios minutos.
 */

import "dotenv/config";
import "./lib/permitir-server-only";
import { syncGoogleMeetSessions } from "../lib/google/meet-sync";

async function main() {
  // Argumento posicional opcional para daysBack
  const posicionales = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const argDays = posicionales[0] ? Number(posicionales[0]) : undefined;
  const conCanceladas = process.argv.includes("--con-canceladas");

  const daysBack = argDays ?? (process.env.GOOGLE_MEET_DAYS_BACK ? Number(process.env.GOOGLE_MEET_DAYS_BACK) : 365);

  if (!Number.isFinite(daysBack) || daysBack <= 0) {
    console.error(`❌ daysBack inválido: ${daysBack}`);
    process.exit(1);
  }

  console.log(`🔄 Backfill Google Meet — daysBack=${daysBack}`);
  console.log(`   (esto puede tardar varios minutos según cantidad de usuarios + eventos)\n`);

  const t0 = Date.now();
  const result = await syncGoogleMeetSessions({ daysBack, marcarCanceladas: conCanceladas });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  if (result.error) {
    console.error(`\n❌ Google no respondió: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n✅ Backfill completado en ${elapsedSec}s`);
  console.log(`   · Sesiones nuevas insertadas:  ${result.synced}`);
  console.log(`   · Sesiones ya existentes:      ${result.alreadyExisted}`);
  console.log(`   · Total procesadas:            ${result.total}`);
  console.log(`   · Canceladas marcadas:         ${conCanceladas ? result.canceladas : "no (sin --con-canceladas)"}`);
}

main().catch((err) => {
  console.error("❌ Error en backfill:", err);
  process.exit(1);
});
