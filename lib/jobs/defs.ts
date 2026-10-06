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
 *   - ventas-ganadas-daily → espejo de los tratos ganados de HubSpot (lo VENDIDO del
 *     año, con su fecha de cierre). Diario ≥ 6:00 CR, incluidos fines de semana: un
 *     trato se gana cualquier día, y el reporte anual lo lee de la base.
 *   - invariants-daily → los invariantes que solo miran la base (lib/invariantes/), diario
 *     ≥ 7:00 CR, después de los espejos. Si alguno está en rojo el job LANZA: semáforo rojo
 *     en Integraciones + Sentry con tags.job. Solo lecturas. (B-08)
 *
 * ⚠ Dos reglas que valen para todos (2026-09-12):
 *   - Un `run` que no toma el turno devuelve `SIN_TURNO`, nunca un `return` pelado: el scheduler
 *     anota «ok» a todo lo demás, y ese «ok» tapaba el rojo de la corrida real (registry.ts).
 *   - Las banderas del `.env` NO se leen acá a mano: pasan por `encendido()`, que usa la misma
 *     regla con la que Integraciones dice por qué un job está apagado (requisitos.ts).
 */
import { tickMarketingCron } from "@/lib/marketing/cron";
import { prisma } from "@/lib/db/prisma";
import { refreshAllCsSignals } from "@/lib/hubspot/cs-signals";
import { syncPartnerClients } from "@/lib/cs/partner-sync";
import { syncVentasGanadas } from "@/lib/ventas/sync-ganadas";
import { watchdogJobs } from "@/lib/cs/watchdog";
import { claimDateKey, correrPasosAislados, SIN_TURNO, type JobDef } from "./registry";
import { motivoApagado, partnerCreaClientes } from "./requisitos";
import { WEEKDAYS_MON_FRI } from "./time";
import { esDiaDeCorte } from "@/lib/cobranza/antiguedad";

/** ¿La configuración de este servidor deja correr el job? Si no, Integraciones dice por qué. */
const encendido = (jobKey: string): boolean => motivoApagado(jobKey, process.env) === null;

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
    /* Fuera del viernes, o ya disparado hoy, no corrió nada: sin esto el semáforo anotaba «ok»
       cada diez minutos toda la semana y un viernes fallido quedaba tapado al tick siguiente. */
    const decision = await tickMarketingCron(now);
    if (!decision.fired) return SIN_TURNO;
  },
};

const csSignalsDaily: JobDef = {
  key: "cs-signals-daily",
  shouldRun: (_now, parts) => encendido("cs-signals-daily") && WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 6,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cs-signals-daily", dateKey, now))) return SIN_TURNO;
    const result = await refreshAllCsSignals({ maxAgeHours: 20 });
    console.log(
      `[jobs/cs-signals] ${dateKey} — refrescados ${result.refreshed.length}, frescos ${result.skippedFresh}, fallidos ${result.failed.length}`,
    );
  },
};

const csPartnerDaily: JobDef = {
  key: "cs-partner-daily",
  shouldRun: (_now, parts) => encendido("cs-partner-daily") && WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 6,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cs-partner-daily", dateKey, now))) return SIN_TURNO;
    const r = await syncPartnerClients({ createClients: partnerCreaClientes(process.env) });
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
  shouldRun: (now, parts) => encendido("cs-watchdog-daily") && watchdogJobs.daily.shouldRun(now, parts),
  run: watchdogJobs.daily.run,
};

const csWatchdogDebounce: JobDef = {
  key: watchdogJobs.debounce.key,
  shouldRun: () => encendido("cs-watchdog-debounce"),
  run: watchdogJobs.debounce.run,
};

// Mantenimiento diario (NO gated por CS: es limpieza de la app, no opt-in).
// Barre PrintJobToken expirados — el export PDF crea un token de 60s por
// descarga y sin sweeper la tabla acumulaba filas muertas indefinidamente.
//
// Y refresca las alertas de cobranza (2026-09-12, lib/cobranza/alertas-refresco.ts): abre los
// vencidos y las promesas incumplidas, pone al día las filas que ya están en el feed y cierra lo
// que dejó de pasar. Va colgado de ESTE job porque ya corre en producción todos los días sin
// ninguna variable: el corte quincenal está apagado desde el 24-jul, y aun encendido una promesa
// rota tardaba hasta 15 días en subir. Corre pasada la medianoche de Costa Rica, así que la alerta
// de una promesa de ayer ya está cuando Alex abre el feed. ⚠ No guarda corte.
const maintenanceDaily: JobDef = {
  key: "maintenance-daily",
  shouldRun: () => true, // una vez al día, a cualquier hora (claimDateKey adentro)
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("maintenance-daily", dateKey, now))) return SIN_TURNO;
    /* ⚠ Pasos AISLADOS (2026-10-05): cada uno corre aunque otro falle; si alguno falló, el job LANZA
       al final con la lista (`correrPasosAislados`, registry.ts). Antes, si el borrado de avisos de
       «Para ti» lanzaba, las alertas de cobranza no se refrescaban ese día. El turno del día se queda
       igual que antes: rojo en Integraciones y Sentry, sin martillar la base cada minuto. Lo que sí
       se hizo, repetirlo mañana no le hace daño. */
    await correrPasosAislados("maintenance-daily", [
      {
        paso: "barrido de tokens de PDF e intentos de acceso",
        correr: async () => {
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
      },
      {
        // «Para ti» (2026-10-04): los avisos leídos hace más de 90 días y los no leídos de más de 180 se borran.
        paso: "avisos viejos de «Para ti»",
        correr: async () => {
          const { borrarAvisosViejos } = await import("@/lib/para-ti/avisos-server");
          const avisos = await borrarAvisosViejos(now);
          if (avisos > 0) console.log(`[jobs/maintenance] ${dateKey} — ${avisos} avisos viejos de «Para ti» borrados`);
        },
      },
      {
        paso: "alertas de cobranza",
        correr: async () => {
          const { refrescarAlertasDeCobranza } = await import("@/lib/cobranza/alertas-refresco");
          const r = await refrescarAlertasDeCobranza(now);
          console.log(
            `[jobs/maintenance] ${dateKey} — alertas de cobranza al ${r.hoy}: ${r.creadas} abiertas, ${r.fundidas} puestas al día, ${r.cerradas} cerradas${r.suprimidas ? `, ${r.suprimidas} suprimidas` : ""}`,
          );
        },
      },
    ]);
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
    if (!encendido("cobranza-quincenal") || parts.hour < 7) return false;
    return esDiaDeCorte(parts.dateKey);
  },
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("cobranza-quincenal", dateKey, now))) return SIN_TURNO;
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
  shouldRun: () => encendido("google-enrich-retry"),
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

/**
 * El espejo de lo VENDIDO. Se sincroniza el AÑO EN CURSO, no todo el histórico: los años
 * cerrados se cargan una vez con scripts/backfill-ventas-ganadas.ts y no hace falta
 * volver a pedirlos todos los días.
 *
 * ⚠ Corre TODOS los días, no solo de lunes a viernes como los de Éxito del cliente: los
 * tratos se cierran cuando se cierran, y el lunes a la mañana el reporte tiene que estar
 * al día. El sync tiene su propio lock cross-máquina, así que el claim del día es solo
 * para no repetir trabajo dentro de la misma jornada.
 */
const ventasGanadasDaily: JobDef = {
  key: "ventas-ganadas-daily",
  shouldRun: (_now, parts) => parts.hour >= 6,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    if (!(await claimDateKey("ventas-ganadas-daily", dateKey, now))) return SIN_TURNO;
    const anio = dateKey.slice(0, 4);
    const r = await syncVentasGanadas({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` });
    // Lock ajeno o corrida parcial: los dos son transitorios. Se libera el claim del día
    // para que el próximo tick reintente, mismo criterio que cs-partner-daily.
    if (r.locked || r.parcial) {
      await prisma.cronJobState
        .updateMany({ where: { id: "ventas-ganadas-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/ventas-ganadas] ${dateKey} — ${r.locked ? "lock ajeno" : "corrida PARCIAL"}; claim liberado para reintentar`);
      return;
    }
    console.log(
      `[jobs/ventas-ganadas] ${dateKey} — ${r.traidas} tratos: ${r.altas} nuevos, ${r.actualizadas} con cambios (${r.cambios} anotados), ${r.reclasificadas} reclasificados${r.sinMonto ? `, ${r.sinMonto} sin monto` : ""}${r.errores.length ? `, ${r.errores.length} errores` : ""}`,
    );
  },
};


/**
 * El espejo de lo FACTURADO. Trae las facturas de venta de Odoo y las deja al lado de los
 * cobros, para que Nexus deje de depender de que alguien marque «facturado» a mano.
 *
 * ⛔ Solo lectura hacia Odoo. ⛔ No toca ningún `Cobro` (INV25).
 *
 * ── POR QUÉ CORRE AUNQUE EL EMPAREJADO NO ESTÉ COMPLETO ─────────────────────────
 * El plan decía que espejar antes de emparejar produce un espejo mal atribuido. Al
 * implementarlo resultó menos rígido: el sync **vuelve a resolver la cuenta de cada factura
 * en cada corrida** y anota el cambio como `CUENTA` en la bitácora. O sea que una factura no
 * puede quedar mal atribuida — como mucho queda SIN atribuir, y se corrige sola la próxima
 * vez que alguien vincula ese cliente.
 *
 * Esperar al emparejado costaría no tener espejo por días, sin ganar nada.
 *
 * ⚠ Necesita `ODOO_PASSWORD`. Sin eso ni se intenta: un intento en vano cuenta para el
 * bloqueo por IP de Odoo (10 fallos por defecto en Odoo 17). `ODOO_SYNC_ENABLED=0` lo apaga
 * sin sacar el código.
 */
const odooEspejoDaily: JobDef = {
  key: "odoo-espejo-daily",
  shouldRun: (_now, parts) => encendido("odoo-espejo-daily") && parts.hour >= 6,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    if (!(await claimDateKey("odoo-espejo-daily", dateKey, now))) return SIN_TURNO;
    const { sincronizarOdoo } = await import("@/lib/cobranza/odoo/sync");
    const r = await sincronizarOdoo({ disparadaPor: "cron" });

    /* Desde el 2026-09-29 la copia también la pide una persona («Actualizar desde Odoo»), y no corren dos a la vez.
       Si justo había una en curso, esta no hizo nada: se suelta el turno y el tick siguiente lo vuelve a intentar,
       con la otra ya terminada. No es una corrida —ni buena ni mala—, así que el scheduler no anota nada. */
    if (r.enCurso) {
      await prisma.cronJobState
        .updateMany({ where: { id: "odoo-espejo-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
        .catch(() => {});
      return SIN_TURNO;
    }

    // ⚠⚠ SOLO se libera el claim cuando el fallo es TRANSITORIO. Este job era el único del
    // scheduler que lo liberaba ante cualquier fallo, y el tick corre cada 60 s: con la
    // autenticación rechazada eso son ~1080 reintentos por día, uno por minuto, cada uno
    // contando para el bloqueo por IP de Odoo — que se sostiene solo mientras el bucle corra.
    //
    // Un rechazo de credenciales NO se arregla reintentando. Se apaga y se avisa.
    /* ⚠ `parcial` NO libera el turno. Una corrida parcial que se repite —Odoo devolviendo la
       mitad porque algo está mal allá— reintentaba cada 60 s todo el día: 1080 corridas, 1080
       filas de basura en SyncOdooCorrida, y la evidencia de la última corrida buena enterrada.
       Si el ERP devuelve la mitad, esperar un minuto no lo arregla; esperar a mañana, tal vez. */
    const transitorio = r.clase === "RED";
    if (!r.ok) {
      if (transitorio) {
        await prisma.cronJobState
          .updateMany({ where: { id: "odoo-espejo-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
          .catch(() => {});
      }
      /* ⚠ LANZA, después de decidir el turno. Hasta el 2026-09-12 un fallo iba solo al log y el
         job volvía como si nada: el scheduler anotaba «ok» y el semáforo de Integraciones quedaba
         en verde con el espejo muerto. Lanzar lo pinta en rojo con este texto y lo manda a Sentry.
         Con un fallo de RED el tick siguiente reintenta y vuelve a lanzar: Sentry descarta el
         evento idéntico al anterior (Dedupe), así que un corte de red no llena el proyecto. */
      const fallo = new Error(
        `${r.parcial ? "corrida PARCIAL" : `FALLÓ (${r.clase ?? "?"})`}: ${r.error}; ` +
          (transitorio
            ? "turno liberado: reintenta en el próximo tick"
            : "turno RETENIDO: no reintenta hasta mañana (docs/RUNBOOK.md, «El espejo de Odoo no corre»)"),
      );
      fallo.name = "SyncOdooFallido";
      throw fallo;
    }
    console.log(
      `[jobs/odoo-espejo] ${dateKey} — ${r.facturasVistas} facturas: ${r.creadas} nuevas, ${r.actualizadas} con cambios (${r.cambios} anotados), ${r.desaparecidas} desaparecidas, ${r.sinCuenta} sin cuenta${r.rechazadas.length ? `, ${r.rechazadas.length} rechazadas` : ""} (${r.duracionMs} ms)`,
    );
  },
};

/**
 * La copia de Mercury (2026-10-02): facturas, clientes y movimientos, una vez al día ≥ 6:00 CR. Mismo molde que la de
 * Odoo: el turno se suelta solo si el fallo es pasajero (red o «esperá» de Mercury) y LANZA si falla, para que el
 * semáforo de Integraciones se ponga en rojo. Sin `MERCURY_API_TOKEN` ni se intenta (requisitos.ts).
 */
const mercuryEspejoDaily: JobDef = {
  key: "mercury-espejo-daily",
  shouldRun: (_now, parts) => encendido("mercury-espejo-daily") && parts.hour >= 6,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    if (!(await claimDateKey("mercury-espejo-daily", dateKey, now))) return SIN_TURNO;
    const { sincronizarMercury } = await import("@/lib/cobranza/mercury/sync");
    const { esTransitorio } = await import("@/lib/cobranza/mercury/transporte");
    const r = await sincronizarMercury({ disparadaPor: "cron" });
    const soltarTurno = () =>
      prisma.cronJobState
        .updateMany({ where: { id: "mercury-espejo-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
        .catch(() => {});
    /* Otra copia en curso (la pidió alguien con el botón): esta no hizo nada, y el tick siguiente lo vuelve a intentar. */
    if (r.enCurso) {
      await soltarTurno();
      return SIN_TURNO;
    }
    if (!r.ok) {
      /* ⚠ Un token rechazado no se arregla reintentando cada minuto: el turno se retiene hasta mañana. */
      const transitorio = !r.parcial && esTransitorio(r.clase);
      if (transitorio) await soltarTurno();
      const fallo = new Error(
        `${r.parcial ? "corrida PARCIAL" : `FALLÓ (${r.clase ?? "?"})`}: ${r.error}; ` +
          (transitorio ? "turno liberado: reintenta en el próximo tick" : "turno RETENIDO: no reintenta hasta mañana"),
      );
      fallo.name = "SyncMercuryFallido";
      throw fallo;
    }
    console.log(
      `[jobs/mercury-espejo] ${dateKey} — ${r.facturasVistas} facturas: ${r.creadas} nuevas, ${r.actualizadas} con cambios, ${r.desaparecidas} desaparecidas · ${r.clientesVistos} clientes (${r.clientesNuevos} nuevos) · ${r.movimientosVistos} movimientos (${r.movimientosNuevos} nuevos)${r.rechazadas.length ? `, ${r.rechazadas.length} facturas sin leer` : ""} (${r.duracionMs} ms)`,
    );
  },
};

/** Cuánto espera el tipo de cambio, después de un fallo pasajero (red, 5xx, 429), antes de volver a probar. */
export const ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS = 30 * 60_000;

/**
 * El tipo de cambio del día (2026-10-05, lib/finanzas/tipo-cambio-server.ts): la venta y la compra de referencia del
 * BCCR, una vez al día ≥ 6:00 CR, para que cada cobro y cada pago se convierta con la tasa de su día. Del servicio del
 * BCCR si hay `BCCR_TOKEN`; si no, del API de Hacienda (sin token). Si todavía falta el histórico, lo intenta traer en
 * la misma corrida. LANZA si no quedó la tasa de hoy (semáforo rojo); el turno se suelta si el fallo fue pasajero, y
 * entonces se vuelve a probar recién pasada `ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS`.
 */
/**
 * La quincena de planilla en curso (2026-10-06): todos los días ≥ 6:00 CR se asegura de que la quincena de hoy exista en
 * el libro, con el salario que rige (`completarQuincenas` con `soloLaDeHoy`). Pedido de Alex («que se programe»): el
 * libro se cortó en agosto porque generarla dependía de que alguien entrara a apretar «Generar» justo esa quincena.
 * Queda PENDIENTE: pagarla la marca una persona (INV18). Re-generar es un no-op (`skipDuplicates`), así que correr todos
 * los días no duplica nada y un servidor caído el día 1 o el 16 se pone al día solo.
 */
const planillaQuincenaDaily: JobDef = {
  key: "planilla-quincena-daily",
  shouldRun: (_now, parts) => parts.hour >= 6,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    if (!(await claimDateKey("planilla-quincena-daily", dateKey, now))) return SIN_TURNO;
    const { completarQuincenas } = await import("@/lib/cobranza/mutations");
    const r = await completarQuincenas(dateKey, { soloLaDeHoy: true });
    const creadas = r.quincenas.reduce((n, q) => n + q.creadas, 0);
    if (creadas > 0 || r.sinSalario > 0) {
      console.log(
        `[jobs/planilla] ${dateKey} — ${creadas} fila(s) nuevas de la quincena en curso` +
          (r.sinSalario > 0 ? ` · ⚠ ${r.sinSalario} salario(s) sin persona ligada: no entran` : ""),
      );
    }
  },
};

const tipoCambioDaily: JobDef = {
  key: "tipo-cambio-daily",
  shouldRun: (_now, parts) => encendido("tipo-cambio-daily") && parts.hour >= 6,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    /* ⚠ ESPERA después de un fallo pasajero (2026-10-05). El fallo suelta el turno para volver a probar hoy, y el tick
       corre cada minuto: con Hacienda caída eran cientos de intentos por día, cada uno con su evento en Sentry y el tick
       (que es secuencial) trabado mientras esperaba a Hacienda. El intento fallido deja el turno SUELTO
       (`lastRunDateKey` vacío) y su hora en `lastRunAt` (la escribe el claim): hasta que pase la espera, ni se intenta. */
    const previo = await prisma.cronJobState.findUnique({
      where: { id: "tipo-cambio-daily" },
      select: { lastRunDateKey: true, lastRunAt: true },
    });
    if (previo?.lastRunDateKey === null && previo.lastRunAt && now.getTime() - previo.lastRunAt.getTime() < ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS) {
      return SIN_TURNO;
    }
    if (!(await claimDateKey("tipo-cambio-daily", dateKey, now))) return SIN_TURNO;
    const { sincronizarTipoDeCambio } = await import("@/lib/finanzas/tipo-cambio-server");
    const r = await sincronizarTipoDeCambio();
    if (!r.ok) {
      if (r.transitorio) {
        await prisma.cronJobState
          .updateMany({ where: { id: "tipo-cambio-daily", lastRunDateKey: dateKey }, data: { lastRunDateKey: null } })
          .catch(() => {});
      }
      const fallo = new Error(
        `sin la tasa de hoy: ${r.avisos.join(" · ") || "ninguna fuente respondió"}; ` +
          (r.transitorio
            ? `turno liberado: reintenta en ${ESPERA_TRAS_FALLO_TIPO_CAMBIO_MS / 60_000} minutos`
            : "turno RETENIDO: no reintenta hasta mañana"),
      );
      fallo.name = "TipoDeCambioFallido";
      throw fallo;
    }
    console.log(
      `[jobs/tipo-cambio] ${dateKey} — ${r.nuevos} día(s) nuevos, ${r.corregidos} corregidos (${r.fuente ?? "sin fuente"}, ${r.desde} a ${r.hasta})` +
        (r.faltaHistorico ? " · ⚠ falta el histórico: hace falta BCCR_TOKEN o que vuelva el de Hacienda" : "") +
        (r.avisos.length ? ` · ${r.avisos.join(" · ")}` : ""),
    );
  },
};

/**
 * Los invariantes que solo miran la base (`lib/invariantes/`), una vez al día ≥ 7:00 CR — después
 * de los espejos de las 6 (ventas, Odoo), para que INV23/INV24 vean la corrida de hoy. Si alguno
 * está en rojo el job LANZA a propósito: el scheduler lo anota en `lastResult` (semáforo rojo en
 * Integraciones, B-03) y lo manda a Sentry con `tags.job` (B-02). El claim del día se queda:
 * un invariante violado no se arregla reintentando cada minuto, se arregla alguien. Solo
 * lecturas. Los que necesitan HubSpot o el sistema de archivos siguen en
 * `scripts/check-invariants.ts`, a mano. (B-08, 2026-09-04)
 */
const invariantsDaily: JobDef = {
  key: "invariants-daily",
  shouldRun: (_now, parts) => parts.hour >= 7,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const { dateKey } = crDateParts(now);
    if (!(await claimDateKey("invariants-daily", dateKey, now))) return SIN_TURNO;
    const { correrJobDeInvariantes } = await import("@/lib/invariantes/job");
    const resumen = await correrJobDeInvariantes(prisma, now);
    console.log(`[jobs/invariants] ${dateKey} — ${resumen}`);
  },
};

/**
 * Avisos de renovación de licencias (2026-10-02, lib/cs/avisos-de-renovacion.ts): a 90, 60 y 30 días
 * de cada renovación, una alerta de «Renovación» en Éxito del cliente. Determinista, sin IA ni costo:
 * corre todos los días ≥ 7:00 CR, después de la copia de HubSpot Partner.
 */
const licenciasRenovacionDaily: JobDef = {
  key: "licencias-renovacion-daily",
  shouldRun: (_now, parts) => parts.hour >= 7,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("licencias-renovacion-daily", dateKey, now))) return SIN_TURNO;
    const { correrAvisosDeRenovacion } = await import("@/lib/cs/avisos-de-renovacion");
    const r = await correrAvisosDeRenovacion(now);
    console.log(`[jobs/licencias] ${dateKey} — ${r.creados} aviso(s) de renovación sobre ${r.revisados} cliente(s)`);
  },
};

/** Jobs activos del scheduler (el orden es el orden de ejecución del tick). */
export function allJobs(): JobDef[] {
  return [marketingWeekly, csSignalsDaily, csPartnerDaily, csWatchdogDaily, csWatchdogDebounce, maintenanceDaily, cobranzaQuincenal, googleEnrichRetry, ventasGanadasDaily, odooEspejoDaily, mercuryEspejoDaily, tipoCambioDaily, planillaQuincenaDaily, licenciasRenovacionDaily, invariantsDaily];
}
