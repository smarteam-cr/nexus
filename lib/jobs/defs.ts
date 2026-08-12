/**
 * lib/jobs/defs.ts
 *
 * Lista EXPLÍCITA de jobs del scheduler (sin registro por side-effect: el orden
 * y la pertenencia se leen acá).
 *
 *   - marketing-weekly  → delega a tickMarketingCron TAL CUAL (ventana viernes
 *     6:00 CR + claim propio en MarketingSettings — no se toca su mecánica).
 *   - cs-signals-daily  → refresh de señales HubSpot de Éxito del cliente,
 *     L–V ≥ 6:00 CR, claim genérico en CronJobState. Gated por CS_WATCHDOG_ENABLED.
 *   - cs-partner-daily  → sync del objeto Partner Clients (uso/licencias/MRR/
 *     renovaciones), L–V ≥ 6:00 CR — ANTES del sweep de las 7 para que el
 *     watchdog vea partner data fresca. Degrada si falta el scope (403).
 *   - cs-watchdog-daily → sweep del watchdog (L–V ≥ 7:00 CR, tras las señales),
 *     con pre-filtro determinístico. Gated por env + CsSettings.watchdogEnabled.
 *   - cs-watchdog-debounce → triage de eventos "quiesced" (>15 min), cada tick.
 */
import { tickMarketingCron } from "@/lib/marketing/cron";
import { prisma } from "@/lib/db/prisma";
import { refreshAllCsSignals } from "@/lib/hubspot/cs-signals";
import { syncPartnerClients } from "@/lib/cs/partner-sync";
import { watchdogJobs } from "@/lib/cs/watchdog";
import { claimDateKey, type JobDef } from "./registry";
import { WEEKDAYS_MON_FRI } from "./time";
import { esDiaDeCorte } from "@/lib/cobranza/antiguedad";

/** Los jobs de Éxito del cliente son OPT-IN por env (prod los prende explícito). */
export function csJobsEnabled(): boolean {
  return process.env.CS_WATCHDOG_ENABLED === "1";
}

const marketingWeekly: JobDef = {
  key: "marketing-weekly",
  // Asegurar el singleton que su claim necesita (lógica que vivía en startMarketingCron).
  init: async () => {
    await prisma.marketingSettings
      .upsert({ where: { id: "marketing" }, update: {}, create: { id: "marketing", brandVoice: "" } })
      .catch((e) => console.error("[jobs/marketing] no se pudo asegurar MarketingSettings:", e));
  },
  // La ventana y el claim viven DENTRO de tickMarketingCron — correr cada tick.
  shouldRun: () => true,
  run: async (now) => {
    await tickMarketingCron(now);
  },
};

const csSignalsDaily: JobDef = {
  key: "cs-signals-daily",
  shouldRun: (_now, parts) => csJobsEnabled() && WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 6,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cs-signals-daily", dateKey, now))) return;
    const result = await refreshAllCsSignals({ maxAgeHours: 20 });
    console.log(
      `[jobs/cs-signals] ${dateKey} — refrescados ${result.refreshed.length}, frescos ${result.skippedFresh}, fallidos ${result.failed.length}`,
    );
  },
};

const csPartnerDaily: JobDef = {
  key: "cs-partner-daily",
  shouldRun: (_now, parts) => csJobsEnabled() && WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 6,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cs-partner-daily", dateKey, now))) return;
    const r = await syncPartnerClients({ createClients: true });
    // Fallo TRANSITORIO (API caída / lock ajeno): liberar el claim del día para
    // que el próximo tick reintente. El 403 de scope NO es transitorio (dura todo
    // el día) — ahí el claim se queda y no se martilla la API.
    if ((r.supported && r.total === 0) || r.locked) {
      await prisma.cronJobState
        .updateMany({ where: { id: "cs-partner-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/cs-partner] ${dateKey} — corrida transitoriamente fallida (${r.locked ? "lock" : "0 records"}); claim liberado para reintentar`);
      return;
    }
    if (!r.supported) {
      console.log(`[jobs/cs-partner] ${dateKey} — scope de partner no autorizado (403), nada que hacer`);
      return;
    }
    console.log(
      `[jobs/cs-partner] ${dateKey} — ${r.total} records (asociaciones ${r.associationsOk ? "ok" : "PARCIALES"}): ${r.matchedByCompany} por company, ${r.matchedByDomain} por dominio, ${r.alreadyLinked} ya vinculados, ${r.createdClients.length} clients creados, ${r.briefsMarkedStale} briefs stale, ${r.unlinkedGone} desvinculados${r.errors.length ? `, ${r.errors.length} errores` : ""}`,
    );
  },
};

const csWatchdogDaily: JobDef = {
  key: watchdogJobs.daily.key,
  shouldRun: (now, parts) => csJobsEnabled() && watchdogJobs.daily.shouldRun(now, parts),
  run: watchdogJobs.daily.run,
};

const csWatchdogDebounce: JobDef = {
  key: watchdogJobs.debounce.key,
  shouldRun: () => csJobsEnabled(),
  run: watchdogJobs.debounce.run,
};

// Mantenimiento diario (NO gated por CS: es limpieza de la app, no opt-in).
// Hoy: barre PrintJobToken expirados — el export PDF crea un token de 60s por
// descarga y sin sweeper la tabla acumulaba filas muertas indefinidamente.
const maintenanceDaily: JobDef = {
  key: "maintenance-daily",
  shouldRun: () => true, // una vez al día, a cualquier hora (claimDateKey adentro)
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("maintenance-daily", dateKey, now))) return;
    const [tokens, attempts] = await Promise.all([
      prisma.printJobToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      // Rate-limit de verify-access: filas sin actividad en 24h ya no acotan nada.
      prisma.externalVerifyAttempt.deleteMany({
        where: { updatedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      }),
    ]);
    console.log(
      `[jobs/maintenance] ${dateKey} — ${tokens.count} PrintJobToken expirados, ${attempts.count} ExternalVerifyAttempt viejos barridos`,
    );
  },
};

// Corte QUINCENAL de Cobranza: computa alertas de cartera, las diffea contra el
// snapshot anterior y guarda el digest (solo-cambios). OPT-IN por env como los de
// CS — el disparo manual (POST /api/cobranza/digest) siempre está disponible
// aunque el cron esté apagado.
//
// Corre al ARRANQUE de cada tanda de cobro (día 1 y día 15, ≥7:00 CR): Smarteam
// cobra en dos ventanas fijas al mes (1-5 y 15-20), así que el corte semanal
// partía el ciclo por la mitad y comparaba períodos que no se corresponden. Las
// ventanas viven en lib/cobranza/antiguedad.ts (`esDiaDeCorte`), única definición.
// `claimDateKey` es por día → aunque el tick corra muchas veces, el corte es uno.
const cobranzaQuincenal: JobDef = {
  key: "cobranza-quincenal",
  shouldRun: (_now, parts) => {
    if (process.env.COBRANZA_CRON_ENABLED !== "1" || parts.hour < 7) return false;
    return esDiaDeCorte(parts.dateKey);
  },
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cobranza-quincenal", dateKey, now))) return;
    const { runCobranzaDigest } = await import("@/lib/cobranza/digest");
    const digest = await runCobranzaDigest(now, "cron");
    console.log(
      `[jobs/cobranza] ${dateKey} — corte quincenal: ${digest.diff.nuevas.length} nuevas, ${digest.diff.resueltas.length} resueltas, ${digest.diff.persistentes} persistentes${digest.diff.sinCambios ? " (sin cambios)" : ""}`,
    );
  },
};

// Drenaje de enriquecimientos FALLIDOS de Google Meet (2026-08-08). Antes un fallo de
// lectura (429, 403, red) sellaba la fila como «lista» para siempre — así se quemaron las
// corridas del 17-may (528/1100) y 7-jul (47/73). Ahora el fallo queda pendiente con su
// error anotado, y este job lo reintenta con espera exponencial (2^intentos horas, tope 5,
// política en lib/google/enrich-retry.ts). Corre cada tick: con cero candidatas es UNA
// query barata, y el backoff por fila hace que el volumen real por tick sea chico.
const googleEnrichRetry: JobDef = {
  key: "google-enrich-retry",
  shouldRun: () => !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && !!process.env.GOOGLE_ADMIN_EMAIL,
  run: async () => {
    const { drenarReintentos } = await import("@/lib/google/meet-enrichment");
    const r = await drenarReintentos(20);
    if (r.enriched + r.skipped + r.errors > 0) {
      console.log(
        `[jobs/google-enrich-retry] ${r.enriched} recuperadas, ${r.skipped} sin contenido, ${r.errors} siguen fallando`,
      );
    }
  },
};

/** Jobs activos del scheduler (el orden es el orden de ejecución del tick). */
export function allJobs(): JobDef[] {
  return [marketingWeekly, csSignalsDaily, csPartnerDaily, csWatchdogDaily, csWatchdogDebounce, maintenanceDaily, cobranzaQuincenal, googleEnrichRetry];
}
