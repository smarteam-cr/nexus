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
 *   - comisiones-hubspot-estimado → la comisión del próximo pago de HubSpot (15 de feb/may/ago/nov), armada con la
 *     comisión proyectada de cada cuenta de la copia de Partner (lib/cobranza/comision-hubspot-server.ts, U25). L–V
 *     ≥ 7:00 CR, una vez al día, después de la copia. Solo escribe la fila estimada que armó Partner (o la crea).
 *   - cs-watchdog-daily → sweep del watchdog (L–V ≥ 7:00 CR, tras las señales),
 *     con pre-filtro determinístico. Gated por env + CsSettings.watchdogEnabled.
 *   - cs-watchdog-debounce → triage de eventos "quiesced" (>15 min), cada tick.
 *   - ventas-ganadas-daily → espejo de los tratos ganados de HubSpot (lo VENDIDO del
 *     año, con su fecha de cierre). Diario ≥ 6:00 CR, incluidos fines de semana: un
 *     trato se gana cualquier día, y el reporte anual lo lee de la base.
 *   - negocios-abiertos → la copia de los negocios ABIERTOS de HubSpot y del dueño de cada empresa
 *     (lib/ventas/sync-negocios-abiertos.ts), cada hora de 6:00 a 20:00 CR, todos los días: «Para ti» de Ventas
 *     muestra los cierres más cerca y la cartera desde esta copia.
 *   - contactos-y-tickets → la copia de los contactos y los tickets de HubSpot de las empresas de Nexus
 *     (lib/contactos/copia-server.ts), cada hora de 6:00 a 20:00 CR, todos los días (etapa 6a de docs/mi-dia-plan.md).
 *   - empresa-copia-de-hubspot → lo que cambió en la empresa de HubSpot vuelve a los datos de la empresa en Nexus
 *     (lib/clients/copia-de-hubspot-server.ts, R2), cada hora de 6:00 a 20:00 CR. Gated por EMPRESA_HUBSPOT_COPIA=1.
 *   - comunicaciones-hubspot → la copia de los correos, las notas y las llamadas de HubSpot de las empresas de Nexus
 *     (lib/comunicaciones/copia-server.ts), cada hora de 6:00 a 20:00 CR, y después la lectura de los compromisos de los
 *     correos enviados (lib/comunicaciones/compromisos-server.ts, contra el presupuesto automático). Iniciativa B.
 *   - indice-de-reuniones → parte en turnos las transcripciones nuevas de las reuniones con clientes y prospectos, para
 *     la búsqueda (lib/busqueda/indexar-server.ts), cada hora, de a 60 (etapa 4c de docs/mi-dia-plan.md).
 *   - google-meet-sync → la copia de Google Meet (Calendar + Docs) cada 10 minutos desde el fin de la anterior
 *     (lib/google/copia-por-job.ts, U1). Lanza la corrida sin esperarla. Gated por GOOGLE_MEET_SYNC_ENABLED≠0 y las
 *     credenciales de Google; apagado, la copia vuelve a correr al abrir la app.
 *   - seguimiento-reuniones → la lectura de cada reunión con un cliente o un prospecto, por la cola
 *     `LecturaDeReunion` (memoria de la cuenta, etapa 2). Cada tick. Gated por SEGUIMIENTO_REUNIONES_ENABLED≠0.
 *   - rentabilidad-foto-mensual → la foto del margen del mes que cerró (lib/rentabilidad/foto-server.ts), el día 3
 *     desde las 7:00 CR; una vez por mes y sin pisar una foto que ya está.
 *   - rentabilidad-lectura-mensual → la lectura de los números (lib/rentabilidad/lectura/servidor.ts), el día 4 desde
 *     las 8:00 CR, una vez por mes, después de la foto. Llama a Claude solo si hay señales y si queda presupuesto.
 *   - odoo-espejo-daily / mercury-espejo-daily → las copias de Odoo y Mercury, cada hora de 6:00 a 19:00 CR desde el
 *     2026-10-21 (antes, una vez al día). La clave sigue diciendo «daily» para no perder la fila ni el semáforo.
 *   - lo-pagado-daily → cobra solo lo que Odoo y Mercury dan por pagado y conciliado con el banco, firmado por el sistema
 *     (lib/cobranza/libro, decisión de Elías del 2026-10-18). Cada hora de 7:00 a 19:00 CR desde el 2026-10-21, después
 *     de las dos copias de esa hora; espera a una copia atrasada hasta las 10:00. Gated por COBRO_SOLO_ENABLED≠0 y alguna
 *     de las dos credenciales. El turno de las tres: lib/jobs/turno-por-hora.ts.
 *   - titulos-cortos → el nombre corto de las tareas abiertas que no lo tienen o cuyo título cambió
 *     (lib/tareas/ia/titulo-corto-server.ts), cada 10 minutos, con Haiku y si queda presupuesto automático.
 *   - reuniones-motivos → POR QUÉ cada reunión de los últimos 90 días no dejó texto, guardado en la reunión
 *     (lib/sessions/motivo-sin-texto-server.ts, T4), cada 10 minutos. Sin IA ni red: una consulta y lo que cambió.
 *   - reuniones-propuestas → a qué empresa propone Nexus cada reunión con texto sin dueña (lib/sessions/
 *     propuesta-de-empresa-server.ts, T3), una vez por hora. El resolver único y una consulta de solo lectura a HubSpot.
 *   - reuniones-audio → mira las transcripciones de audio en curso (lib/sessions/audio-de-reunion-server.ts, T5), cada
 *     tick. Gated por REUNIONES_AUDIO=1 y el bucket; sin audios en curso devuelve SIN_TURNO.
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
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { refreshAllCsSignals } from "@/lib/hubspot/cs-signals";
import { syncPartnerClients } from "@/lib/cs/partner-sync";
import { syncVentasGanadas } from "@/lib/ventas/sync-ganadas";
import { watchdogJobs } from "@/lib/cs/watchdog";
import { claimDateKey, correrPasosAislados, SIN_TURNO, type JobDef } from "./registry";
import { motivoApagado, partnerCreaClientes } from "./requisitos";
import { WEEKDAYS_MON_FRI } from "./time";
import { retenidoHoy, turnoDeLaHora, turnoRetenido } from "./turno-por-hora";
import { esDiaDeCorte } from "@/lib/cobranza/antiguedad";
import { mesQueTocaFotografiar } from "@/lib/rentabilidad/foto";
import { mesQueTocaLeer } from "@/lib/rentabilidad/lectura/estado";

/**
 * ¿Queda presupuesto de IA automático hoy? Los jobs que gastan Claude lo miran ANTES de arrancar (2026-10-18): antes,
 * con el tope agotado y el bloqueo prendido, cada llamada fallaba una por una en el chokepoint. Sin presupuesto el job
 * devuelve SIN_TURNO y lo intenta el tick siguiente (lo del día no se pierde: espera). Lo no sabido no frena.
 */
async function quedaPresupuesto(now: Date): Promise<boolean> {
  const { quedaPresupuestoAutomatico } = await import("@/lib/ai/guardia-de-presupuesto");
  return quedaPresupuestoAutomatico(now);
}

/** ¿La configuración de este servidor deja correr el job? Si no, Integraciones dice por qué. */
const encendido = (jobKey: string): boolean => motivoApagado(jobKey, process.env) === null;

/**
 * El turno de esta hora para las copias de Odoo y Mercury y el cobro de lo pagado (2026-10-21, lib/jobs/turno-por-hora.ts).
 * `SIN_TURNO` = no le toca: otro proceso tomó la hora, o el job quedó retenido hoy por un fallo que no se arregla
 * reintentando (no se toca a Odoo ni a Mercury hasta mañana). `soltar` deja la hora libre para el tick siguiente;
 * `retener` cierra el día.
 */
async function turnoDeFinanzas(jobKey: string, now: Date) {
  const { crDateParts } = await import("./time");
  const { dateKey, hour } = crDateParts(now);
  const fila = await prisma.cronJobState.findUnique({ where: { id: jobKey }, select: { lastRunDateKey: true } });
  if (retenidoHoy(fila?.lastRunDateKey, dateKey)) return SIN_TURNO;
  const turno = turnoDeLaHora(dateKey, hour);
  if (!(await claimDateKey(jobKey, turno, now))) return SIN_TURNO;
  const cambiar = (lastRunDateKey: string | null) =>
    prisma.cronJobState.updateMany({ where: { id: jobKey, lastRunDateKey: turno }, data: { lastRunDateKey } }).catch(() => {});
  return { turno, soltar: () => cambiar(null), retener: () => cambiar(turnoRetenido(dateKey)) };
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
    if (!(await quedaPresupuesto(now))) return SIN_TURNO;
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

const comisionesHubspotEstimado: JobDef = {
  key: "comisiones-hubspot-estimado",
  shouldRun: (_now, parts) => encendido("comisiones-hubspot-estimado") && WEEKDAYS_MON_FRI.has(parts.weekday) && parts.hour >= 7,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("comisiones-hubspot-estimado", dateKey, now))) return SIN_TURNO;
    const { aplicarEstimado } = await import("@/lib/cobranza/comision-hubspot-server");
    const r = await aplicarEstimado(prisma, dateKey, now);
    const pago = r.plan.estimado?.pago;
    if (r.escrito) {
      console.log(
        `[jobs/comisiones-hubspot] ${dateKey} — comisión del ${pago?.fecha} (${pago?.trimestre}) ${r.escrito.accion}: ` +
          `${r.escrito.antes ?? "—"} → ${r.escrito.despues} USD, ${r.plan.estimado?.cuentas.length ?? 0} cuentas`,
      );
    } else {
      const motivo = r.aviso ?? (r.plan.decision.accion === "nada" ? r.plan.decision.motivo : "sin cambios");
      console.log(`[jobs/comisiones-hubspot] ${dateKey} — no se escribió nada: ${motivo}`);
    }
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

/**
 * La copia de Google Meet cada 10 minutos (U1, 2026-10-25; lib/google/copia-por-job.ts): la copia de Calendar y la
 * lectura de los Docs, que hasta U1 corrían solo al abrir la app. Cada tick LANZA la corrida y vuelve: no la espera
 * (una corrida larga no puede quedarse dentro del tick). Siempre devuelve SIN_TURNO; la corrida anota su resultado al
 * terminar. El turno y la espera de 10 minutos desde el fin viven en `autoSyncGoogleMeet`, compartidos con la vuelta
 * atrás (GOOGLE_MEET_SYNC_ENABLED=0 → la copia corre al abrir la app): nunca a la vez.
 */
const googleMeetSync: JobDef = {
  key: "google-meet-sync",
  shouldRun: () => encendido("google-meet-sync"),
  run: async () => {
    const { lanzarCopiaDeMeet } = await import("@/lib/google/copia-por-job");
    lanzarCopiaDeMeet();
    return SIN_TURNO;
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
  run: async (now) => {
    // Recuperar una reunión dispara su lectura (Claude): sin presupuesto automático, espera al tick siguiente.
    if (!(await quedaPresupuesto(now))) return SIN_TURNO;
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
 * Las reuniones de sprint de cada equipo (Tareas, ficha A del 2026-10-17, lib/tareas/fuentes-server.ts). Cada tick
 * mira las series de sprint configuradas y pide la lectura de cada reunión nueva que terminó; la misma función que
 * corre al abrir Tareas, con su espera de 10 minutos por proceso (sin `forzar`). Nunca corre la sync de Meet: lee lo
 * que ya llegó. Sin nada que pedir devuelve SIN_TURNO.
 */
const tareasSprint: JobDef = {
  key: "tareas-sprint",
  shouldRun: () => true,
  run: async (now) => {
    if (!(await quedaPresupuesto(now))) return SIN_TURNO;
    const { mirarLasSeriesDelSprint } = await import("@/lib/tareas/fuentes-server");
    const r = await mirarLasSeriesDelSprint(now);
    if (r.omitida || (r.pedidas === 0 && r.pausadas === 0)) return SIN_TURNO;
    console.log(`[jobs/tareas-sprint] ${r.series} series, ${r.pedidas} lecturas pedidas, ${r.pausadas} pausadas`);
  },
};

/**
 * La lectura de cada reunión (memoria de la cuenta, etapa 2, lib/lecturas/leer.ts). Cada tick: si está el SQL de las
 * columnas `seguimiento*` y queda presupuesto automático, toma 2 reuniones de la cola (`LecturaDeReunion`) con un
 * update condicional, las lee en paralelo con 420 s de tope cada una (el tope CORTA la lectura) y después vincula a su
 * proyecto las reuniones que la lectura no toma. Una colgada más de 15 minutos vuelve a la cola; un error se reintenta
 * a los 5 y a los 30 minutos y a la tercera (también la tercera vez que se cuelga) queda en `error`: ahí el job LANZA
 * (semáforo rojo + Sentry). Sin nada que tomar devuelve SIN_TURNO. Lo que
 * sigue a cada lectura (avance, ficha, etapa, preventa) corre en segundo plano: el tick no lo espera.
 * `SEGUIMIENTO_REUNIONES_ENABLED=0` lo apaga y el enriquecimiento vuelve al post-proceso viejo.
 */
const negociosAbiertos: JobDef = {
  key: "negocios-abiertos",
  shouldRun: (_now, parts) => parts.hour >= 6 && parts.hour <= 20,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    // Una corrida por hora: la clave del turno es el día y la hora de Costa Rica.
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("negocios-abiertos", turno, now))) return SIN_TURNO;
    const { syncNegociosAbiertos } = await import("@/lib/ventas/sync-negocios-abiertos");
    const r = await syncNegociosAbiertos();
    if (r.locked || r.parcial) {
      // Transitorio (otra corrida en curso o una búsqueda que trajo poco): se suelta el turno para reintentar.
      await prisma.cronJobState
        .updateMany({ where: { id: "negocios-abiertos", lastRunDateKey: turno }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/negocios-abiertos] ${turno} — ${r.locked ? "lock ajeno" : "corrida PARCIAL"}; turno liberado para reintentar`);
      return;
    }
    // El siguiente paso de cada equipo es una tarea (fase 0.2): las cuentas cuyas tareas cambiaron en las últimas dos
    // horas ponen al día lo que dice HubSpot. Después, lo que quedó sin escribir allá (lib/siguiente-paso).
    const { reintentarEscrituras, sincronizarCuentasCambiadas } = await import("@/lib/siguiente-paso/escritura-server");
    const puestas = await sincronizarCuentasCambiadas(new Date(now.getTime() - 2 * 3_600_000)).catch((e) => {
      console.error("[jobs/negocios-abiertos] siguientes pasos desde las tareas:", e);
      return null;
    });
    const pasos = await reintentarEscrituras().catch((e) => {
      console.error("[jobs/negocios-abiertos] reintento de siguientes pasos:", e);
      return null;
    });
    // Las metas comerciales, cada hora (2026-10-19): una meta creada en HubSpot a media mañana llegaba a «Para ti» recién
    // al día siguiente, con la copia de las 6:00. Solo lee HubSpot; si falla, no tumba la copia de los negocios.
    const { syncMetasComerciales } = await import("@/lib/ventas/metas-sync");
    const metas = await syncMetasComerciales().catch((e) => {
      console.error("[jobs/negocios-abiertos] metas:", e);
      return null;
    });
    console.log(
      `[jobs/negocios-abiertos] ${turno} — ${r.traidos} abiertos: ${r.altas} nuevos, ${r.actualizados} con cambios, ${r.cerrados} cerrados, ${r.duenosActualizados} dueños de empresa` +
        ` · siguientes pasos: ${r.pasos.nuevos} desde HubSpot, ${r.pasos.cerrados} borrados allá${puestas?.cuentas ? `, ${puestas.escritos} escritos de ${puestas.cuentas} cuentas con tareas cambiadas` : ""}${pasos?.intentados ? `, ${pasos.escritos} de ${pasos.intentados} reescritos` : ""}` +
        `${r.errores.length ? `, ${r.errores.length} errores` : ""}` +
        (metas ? (metas.sinPermiso ? " · metas: sin el permiso de HubSpot" : ` · metas: ${metas.guardadas} tramos${metas.sinPersona ? `, ${metas.sinPersona} sin persona` : ""}`) : ""),
    );
  },
};

/**
 * Las tareas de HubSpot del equipo, en Tareas internas, en los dos sentidos (2026-10-15, etapa 3 de docs/mi-dia-plan.md;
 * lib/tareas-hubspot). Cada 15 minutos de 6:00 a 21:00 de Costa Rica. Si otra corrida tiene el candado, suelta el turno.
 */
const tareasHubspot: JobDef = {
  key: "tareas-hubspot",
  shouldRun: (_now, parts) => encendido("tareas-hubspot") && parts.hour >= 6 && parts.hour <= 21,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const cuarto = Math.floor(now.getUTCMinutes() / 15) * 15;
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}:${String(cuarto).padStart(2, "0")}`;
    if (!(await claimDateKey("tareas-hubspot", turno, now))) return SIN_TURNO;
    const { copiarTareasDeHubspot } = await import("@/lib/tareas-hubspot/sync-server");
    const r = await copiarTareasDeHubspot({}, now);
    if (r.locked) {
      await prisma.cronJobState
        .updateMany({ where: { id: "tareas-hubspot", lastRunDateKey: turno }, data: { lastRunDateKey: null } })
        .catch(() => {});
      return;
    }
    console.log(
      `[jobs/tareas-hubspot] ${turno} — ${r.traidas} de HubSpot: ${r.nuevas} nuevas, ${r.aplicadasEnNexus} cambiaron allá, ${r.escritasEnHubspot} escritas allá, ${r.cerradas} cerradas${r.errores.length ? `, ${r.errores.length} errores` : ""}`,
    );
    if (r.errores.length) console.warn(`[jobs/tareas-hubspot] ${r.errores.slice(0, 5).join(" · ")}`);
  },
};

const seguimientoReuniones: JobDef = {
  key: "seguimiento-reuniones",
  shouldRun: () => encendido("seguimiento-reuniones"),
  run: async (now) => {
    const { correrTandaDeSeguimiento } = await import("@/lib/lecturas/leer");
    const r = await correrTandaDeSeguimiento(now);
    if (r.sinTurno) return SIN_TURNO;
    const porEstado = new Map<string, number>();
    for (const l of r.leidas) porEstado.set(l.estado, (porEstado.get(l.estado) ?? 0) + 1);
    console.log(
      `[jobs/seguimiento-reuniones] ${r.leidas.length} lectura(s): ${[...porEstado.entries()].map(([e, n]) => `${n} ${e}`).join(", ") || "ninguna"}` +
        (r.vinculo ? ` · vínculo: ${r.vinculo.vinculadas} de ${r.vinculo.revisadas} reunión(es) con solo notas` : ""),
    );
    if (r.erroresFinales.length) {
      const fallo = new Error(
        `${r.erroresFinales.length} reunión(es) quedaron en error tras 3 intentos: ${r.erroresFinales.map((x) => `${x.sessionId} (${x.error.slice(0, 120)})`).join("; ")}`,
      );
      fallo.name = "LecturaDeReunionFallida";
      throw fallo;
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
    // Las metas comerciales de HubSpot (2026-10-08), en la misma corrida: miden lo vendido contra la meta. Si fallan,
    // no tumban el job: lo vendido ya quedó copiado, y las metas de ayer siguen ahí.
    try {
      const { syncMetasComerciales } = await import("@/lib/ventas/metas-sync");
      const m = await syncMetasComerciales();
      console.log(
        m.sinPermiso
          ? `[jobs/ventas-ganadas] ${dateKey} — metas: sin el permiso de HubSpot (reconectar desde Integraciones)`
          : `[jobs/ventas-ganadas] ${dateKey} — metas: ${m.guardadas} tramos${m.sinPersona ? `, ${m.sinPersona} sin persona en Nexus` : ""}${m.dadasDeBaja ? `, ${m.dadasDeBaja} dadas de baja` : ""}${m.errores.length ? `, ${m.errores.length} errores` : ""}`,
      );
    } catch (e) {
      console.error(`[jobs/ventas-ganadas] ${dateKey} — metas: ${e instanceof Error ? e.message : String(e)}`);
    }
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
 *
 * Cada hora de 6:00 a 19:00 CR desde el 2026-10-21 (`turnoDeFinanzas`): lo que administración concilia en Odoo durante
 * el día se ve en Nexus a la hora siguiente, y `lo-pagado-daily` lo cobra detrás.
 */
const odooEspejoDaily: JobDef = {
  key: "odoo-espejo-daily",
  shouldRun: (_now, parts) => encendido("odoo-espejo-daily") && parts.hour >= 6,
  run: async (now) => {
    const t = await turnoDeFinanzas("odoo-espejo-daily", now);
    if (t === SIN_TURNO) return SIN_TURNO;
    const { sincronizarOdoo } = await import("@/lib/cobranza/odoo/sync");
    const r = await sincronizarOdoo({ disparadaPor: "cron" });

    /* Desde el 2026-09-29 la copia también la pide una persona («Actualizar desde Odoo»), y no corren dos a la vez.
       Si justo había una en curso, esta no hizo nada: se suelta el turno y el tick siguiente lo vuelve a intentar,
       con la otra ya terminada. No es una corrida —ni buena ni mala—, así que el scheduler no anota nada. */
    if (r.enCurso) {
      await t.soltar();
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
    /* ⚠ Desde que corre cada hora (2026-10-21), retener cierra el DÍA y no solo la hora: 13 intentos con la clave
       rechazada superan el bloqueo por IP de Odoo (10 fallos en Odoo 17). */
    const transitorio = r.clase === "RED";
    if (!r.ok) {
      await (transitorio ? t.soltar() : t.retener());
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
      `[jobs/odoo-espejo] ${t.turno} —${r.facturasVistas} facturas: ${r.creadas} nuevas, ${r.actualizadas} con cambios (${r.cambios} anotados), ${r.desaparecidas} desaparecidas, ${r.sinCuenta} sin cuenta${r.rechazadas.length ? `, ${r.rechazadas.length} rechazadas` : ""} (${r.duracionMs} ms)`,
    );
  },
};

/**
 * La copia de Mercury (2026-10-02): facturas, clientes y movimientos, cada hora de 6:00 a 19:00 CR desde el 2026-10-21
 * (`turnoDeFinanzas`; antes una vez al día). Mismo molde que la de
 * Odoo: el turno se suelta solo si el fallo es pasajero (red o «esperá» de Mercury) y LANZA si falla, para que el
 * semáforo de Integraciones se ponga en rojo. Sin `MERCURY_API_TOKEN` ni se intenta (requisitos.ts).
 */
const mercuryEspejoDaily: JobDef = {
  key: "mercury-espejo-daily",
  shouldRun: (_now, parts) => encendido("mercury-espejo-daily") && parts.hour >= 6,
  run: async (now) => {
    const t = await turnoDeFinanzas("mercury-espejo-daily", now);
    if (t === SIN_TURNO) return SIN_TURNO;
    const { sincronizarMercury } = await import("@/lib/cobranza/mercury/sync");
    const { esTransitorio } = await import("@/lib/cobranza/mercury/transporte");
    const r = await sincronizarMercury({ disparadaPor: "cron" });
    /* Otra copia en curso (la pidió alguien con el botón): esta no hizo nada, y el tick siguiente lo vuelve a intentar. */
    if (r.enCurso) {
      await t.soltar();
      return SIN_TURNO;
    }
    if (!r.ok) {
      /* ⚠ Un token rechazado no se arregla reintentando cada hora: el turno se retiene hasta mañana. */
      const transitorio = !r.parcial && esTransitorio(r.clase);
      await (transitorio ? t.soltar() : t.retener());
      const fallo = new Error(
        `${r.parcial ? "corrida PARCIAL" : `FALLÓ (${r.clase ?? "?"})`}: ${r.error}; ` +
          (transitorio ? "turno liberado: reintenta en el próximo tick" : "turno RETENIDO: no reintenta hasta mañana"),
      );
      fallo.name = "SyncMercuryFallido";
      throw fallo;
    }
    console.log(
      `[jobs/mercury-espejo] ${t.turno} —${r.facturasVistas} facturas: ${r.creadas} nuevas, ${r.actualizadas} con cambios, ${r.desaparecidas} desaparecidas · ${r.clientesVistos} clientes (${r.clientesNuevos} nuevos) · ${r.movimientosVistos} movimientos (${r.movimientosNuevos} nuevos)${r.rechazadas.length ? `, ${r.rechazadas.length} facturas sin leer` : ""} (${r.duracionMs} ms)`,
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
 * Lo pagado se cobra solo (2026-10-18). Cada hora de 7:00 a 19:00 CR desde el 2026-10-21 (antes, una vez al día),
 * después de las copias de Odoo y Mercury de esa hora: lo que dan por pagado y
 * conciliado con el banco pasa a COBRADO con el día real del pago, firmado `sistema:odoo` o `sistema:mercury`, con su
 * bitácora (lib/cobranza/libro/aplicar.ts › `cobrarLoPagadoSolo`). Lo que no es seguro queda en Conciliación › «Lo
 * pagado» para una persona.
 *
 * El turno se toma recién cuando toca (`decidirElTurno`): mientras una copia encendida no corrió bien hoy, espera hasta
 * las 10:00 sin anotar nada. Pasada esa hora cobra con la que está al día y LANZA diciendo cuál faltó (semáforo rojo).
 * También lanza si alguna cuota no se pudo escribir o si Odoo no dijo el día de los pagos: esas esperan a la próxima
 * hora. El mismo cobro corre cuando alguien aprieta «Actualizar» (lib/cobranza/libro/cobro-a-pedido.ts), con el mismo
 * candado: nunca dos a la vez.
 */
const loPagadoDaily: JobDef = {
  key: "lo-pagado-daily",
  shouldRun: (_now, parts) => encendido("lo-pagado-daily") && parts.hour >= 7,
  run: async (now) => {
    const { correrElCobroConCandado } = await import("@/lib/cobranza/libro/cobro-a-pedido");
    const t = await turnoDeFinanzas("lo-pagado-daily", now);
    if (t === SIN_TURNO) return SIN_TURNO;
    /* Con candado (2026-10-21): una persona puede estar cobrando con «Actualizar» en este mismo momento. */
    const r = await correrElCobroConCandado(now, { aplicar: true });
    if (r.enCurso || !r.resultado) {
      /* Otro cobro en curso, o todavía no toca: se suelta el turno y el tick siguiente vuelve a mirar las copias. */
      await t.soltar();
      return SIN_TURNO;
    }
    const { turno, resultado, orden, errorDelOrden } = r;
    const plata = (xs: ReadonlyArray<{ monto: number; moneda: string }>) => {
      const t = new Map<string, number>();
      for (const x of xs) t.set(x.moneda, Math.round(((t.get(x.moneda) ?? 0) + x.monto) * 100) / 100);
      return [...t].map(([m, v]) => `${m} ${v}`).join(" + ") || "nada";
    };
    console.log(
      `[jobs/lo-pagado] ${t.turno} — cobradas solas: ${resultado.cobradas.length} (${plata(resultado.cobradas)}) · ` +
        `quedan para una persona: ${resultado.quedan.length} · sin el día del pago: ${resultado.pagadasSinFecha}` +
        ` · ordenadas solas: ${orden?.escritas ?? 0}`,
    );
    const problemas = [
      ...turno.atrasadas.map((f) => `la copia de ${f === "ODOO" ? "Odoo" : "Mercury"} no corrió bien hoy: lo suyo no se cobró`),
      ...(resultado.avisoOdoo ? [resultado.avisoOdoo] : []),
      ...resultado.saltadas.map((s) => `${s.cuenta}: ${s.motivo}`),
      ...(errorDelOrden ? [`el orden de «Lo que no cuadra» falló: ${errorDelOrden}`] : []),
      ...(orden?.saltadas ?? []).map((s) => `${s.cuenta} ${s.numero} (orden): ${s.motivo}`),
    ];
    if (problemas.length) {
      const fallo = new Error(`cobró ${resultado.cobradas.length}, pero: ${problemas.join(" · ")}. La próxima hora vuelve a mirar.`);
      fallo.name = "CobroSoloIncompleto";
      throw fallo;
    }
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
    console.log(`[jobs/licencias] ${dateKey} — ${r.creados} aviso(s) de renovación nuevos, ${r.juntados} juntado(s) con lo que vio el vigía y ${r.cerrados} cerrado(s) sobre ${r.revisados} cliente(s)`);
  },
};

/**
 * Recordar revisar la adopción (2026-10-07, lib/cs/recordatorios-de-adopcion.ts): a los 30 días del inicio, una
 * semana antes de la entrega y una vez al mes en las cuentas recurrentes. Un aviso de «Para ti» al CSE de la cuenta
 * y a quien lleva el frente de Customer Success. Sin IA. ≥ 7:00 CR, una vez al día.
 */
const adopcionRecordatoriosDaily: JobDef = {
  key: "adopcion-recordatorios-daily",
  shouldRun: (_now, parts) => parts.hour >= 7,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("adopcion-recordatorios-daily", dateKey, now))) return SIN_TURNO;
    const { correrRecordatoriosDeAdopcion } = await import("@/lib/cs/recordatorios-de-adopcion-server");
    const r = await correrRecordatoriosDeAdopcion(now);
    console.log(`[jobs/adopcion] ${dateKey} — ${r.recordatorios} recordatorio(s), ${r.avisos} aviso(s)`);
  },
};

/**
 * Tareas internas — el lunes (docs/tareas-plan.md §5.8): vence las propuestas que nadie decidió en 14 días, pasa a
 * «Por asignar» lo abierto de quien se dio de baja y muda al sprint de casa lo de quien cambió de área. Sin IA. Los
 * lunes ≥ 6:00 CR. Con `TAREAS_CIERRE_AUTOMATICO=1`, antes revisa como sistema la semana pasada de quien no la
 * revisó (apagado por defecto).
 */
const tareasSemanaLunes: JobDef = {
  key: "tareas-semana-lunes",
  shouldRun: (_now, parts) => parts.weekday === "Mon" && parts.hour >= 6,
  run: async (now) => {
    const { dateKey } = (await import("./time")).crDateParts(now);
    if (!(await claimDateKey("tareas-semana-lunes", dateKey, now))) return SIN_TURNO;
    const { cerrarSemanaPasadaComoSistema, cierreAutomaticoPrendido, mantenimientoDelLunes } = await import("@/lib/tareas/mutaciones");
    if (cierreAutomaticoPrendido()) {
      const c = await cerrarSemanaPasadaComoSistema(now);
      console.log(`[jobs/tareas-lunes] ${dateKey} — el sistema revisó la semana pasada de ${c.personas} persona(s): ${c.tareas} tarea(s) pasaron a esta semana`);
    }
    const r = await mantenimientoDelLunes(now);
    console.log(
      `[jobs/tareas-lunes] ${dateKey} — ${r.vencidas} propuesta(s) y ${r.proyectosVencidos} proyecto(s) vencidos, ${r.aPorAsignar} a «Por asignar», ${r.mudadas} mudada(s) de sprint${r.privadasDeBajas ? `, ${r.privadasDeBajas} privada(s) de bajas sin tocar` : ""}`,
    );
  },
};

/**
 * La foto del margen del mes que cerró (Rentabilidad, E6 de docs/rentabilidad-y-carga-plan.md, 2026-10-17): desde el día
 * 3 a las 7:00 CR (los cobros y el tipo de cambio del mes ya están), guarda lo que el cálculo en vivo dice de ese mes
 * (lib/rentabilidad/foto-server.ts). El turno es del MES: corre una vez por mes. No pisa una foto que ya está. Si falla,
 * suelta el turno y vuelve a probar pasada una hora (cada intento lee medio Nexus: no cada minuto).
 */
const ESPERA_TRAS_FALLO_FOTO_MS = 60 * 60_000;
const rentabilidadFotoMensual: JobDef = {
  key: "rentabilidad-foto-mensual",
  shouldRun: (now) => mesQueTocaFotografiar(now) !== null,
  run: async (now) => {
    const mes = mesQueTocaFotografiar(now);
    if (!mes) return SIN_TURNO;
    const previo = await prisma.cronJobState.findUnique({
      where: { id: "rentabilidad-foto-mensual" },
      select: { lastRunDateKey: true, lastRunAt: true },
    });
    if (previo?.lastRunDateKey === null && previo.lastRunAt && now.getTime() - previo.lastRunAt.getTime() < ESPERA_TRAS_FALLO_FOTO_MS) {
      return SIN_TURNO;
    }
    if (!(await claimDateKey("rentabilidad-foto-mensual", mes, now))) return SIN_TURNO;
    const { tomarFotoDelMes } = await import("@/lib/rentabilidad/foto-server");
    try {
      const r = await tomarFotoDelMes(mes, { por: "sistema", ahora: now });
      console.log(
        r.estado === "ya-estaba"
          ? `[jobs/rentabilidad-foto] ${mes} — ya tenía foto (${r.tomadaPor}, ${r.tomadaAt.toISOString().slice(0, 10)}): no se tocó`
          : `[jobs/rentabilidad-foto] ${mes} — foto tomada: ${r.cuentas} cuenta(s)`,
      );
    } catch (e) {
      await prisma.cronJobState
        .updateMany({ where: { id: "rentabilidad-foto-mensual", lastRunDateKey: mes }, data: { lastRunDateKey: null } })
        .catch(() => {});
      throw e;
    }
  },
};

/**
 * La lectura de los números (iniciativa C de docs/roadmap.md): una vez por mes, el día 4 desde las 8:00 CR, después de la
 * foto del día 3. Nunca cada día. Sin presupuesto automático espera al tick siguiente; si falla, suelta el turno y
 * reintenta a la hora (como la foto). Lo que propone queda pendiente hasta que una persona lo decide.
 */
const rentabilidadLecturaMensual: JobDef = {
  key: "rentabilidad-lectura-mensual",
  shouldRun: (now) => mesQueTocaLeer(now) !== null,
  run: async (now) => {
    const mes = mesQueTocaLeer(now);
    if (!mes) return SIN_TURNO;
    const previo = await prisma.cronJobState.findUnique({
      where: { id: "rentabilidad-lectura-mensual" },
      select: { lastRunDateKey: true, lastRunAt: true },
    });
    if (previo?.lastRunDateKey === mes) return SIN_TURNO;
    if (previo?.lastRunDateKey === null && previo.lastRunAt && now.getTime() - previo.lastRunAt.getTime() < ESPERA_TRAS_FALLO_FOTO_MS) {
      return SIN_TURNO;
    }
    if (!(await quedaPresupuesto(now))) return SIN_TURNO;
    if (!(await claimDateKey("rentabilidad-lectura-mensual", mes, now))) return SIN_TURNO;
    const { correrLecturaDeLosNumeros } = await import("@/lib/rentabilidad/lectura/servidor");
    try {
      const r = await correrLecturaDeLosNumeros({ por: null, ahora: now });
      console.log(`[jobs/rentabilidad-lectura] ${mes} — ${r.senales} señales, ${r.nuevas} propuestas nuevas`);
    } catch (e) {
      await prisma.cronJobState
        .updateMany({ where: { id: "rentabilidad-lectura-mensual", lastRunDateKey: mes }, data: { lastRunDateKey: null } })
        .catch(() => {});
      throw e;
    }
  },
};

/** Jobs activos del scheduler (el orden es el orden de ejecución del tick). */
/**
 * La copia de los contactos y los tickets de HubSpot (etapa 6a de docs/mi-dia-plan.md). Solo lee HubSpot. Una corrida por
 * hora; si otra tiene el candado, se suelta el turno para reintentar en el tick siguiente. Después, las notas de la
 * cuenta que quedaron sin escribir en HubSpot (etapa 5), hasta 25 por corrida y 5 intentos cada una.
 */
const contactosYTickets: JobDef = {
  key: "contactos-y-tickets",
  shouldRun: (_now, parts) => parts.hour >= 6 && parts.hour <= 20,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("contactos-y-tickets", turno, now))) return SIN_TURNO;
    const { copiarContactosYTickets } = await import("@/lib/contactos/copia-server");
    const r = await copiarContactosYTickets();
    if (r.locked) {
      await prisma.cronJobState
        .updateMany({ where: { id: "contactos-y-tickets", lastRunDateKey: turno }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/contactos-y-tickets] ${turno} — lock ajeno; turno liberado para reintentar`);
      return;
    }
    const m = (n: string, x: typeof r.contactos) =>
      x.sinPermiso ? `${n}: sin permiso` : `${n}: ${x.creados} nuevos, ${x.actualizados} con cambios, ${x.bajas} de baja${x.ilegibles ? `, ${x.ilegibles} empresas sin leer` : ""}`;
    console.log(`[jobs/contactos-y-tickets] ${turno} — ${r.empresas} empresas · ${m("contactos", r.contactos)} · ${m("tickets", r.tickets)}`);
    const { reintentarNotas } = await import("@/lib/notas/escritura-server");
    const notas = await reintentarNotas().catch((e: unknown) => {
      if (esquemaDesactualizado(e)) return null;
      throw e;
    });
    if (notas?.intentadas) console.log(`[jobs/contactos-y-tickets] notas: ${notas.escritas} escritas en HubSpot, ${notas.conError} con error`);
  },
};

/**
 * La copia de los datos de las empresas desde HubSpot (R2, 2026-10-25, lib/clients/copia-de-hubspot-server.ts): lo que
 * alguien cambió allá vuelve a Nexus y la regla de quién manda decide si se aplica o queda como propuesta. Lee HubSpot y,
 * con EMPRESA_HUBSPOT_ESCRITURA=1, escribe allá lo que recalculó (el TAM). Una corrida por hora de 6:00 a 20:00 CR, con EMPRESA_HUBSPOT_COPIA=1; con el candado ajeno, suelta el turno.
 * Sin el SQL de la empresa, lo dice y no falla.
 */
const empresaCopiaDeHubspot: JobDef = {
  key: "empresa-copia-de-hubspot",
  shouldRun: (_now, parts) => encendido("empresa-copia-de-hubspot") && parts.hour >= 6 && parts.hour <= 20,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("empresa-copia-de-hubspot", turno, now))) return SIN_TURNO;
    const { copiarEmpresasDeHubspot } = await import("@/lib/clients/copia-de-hubspot-server");
    let r: Awaited<ReturnType<typeof copiarEmpresasDeHubspot>>;
    try {
      r = await copiarEmpresasDeHubspot({ apply: true, ahora: now });
    } catch (e) {
      if (esquemaDesactualizado(e)) {
        console.log(`[jobs/empresa-copia-de-hubspot] ${turno} — falta el SQL 2026-10-25-empresa-parte-2.sql`);
        return;
      }
      throw e;
    }
    if (r.locked) {
      await prisma.cronJobState
        .updateMany({ where: { id: "empresa-copia-de-hubspot", lastRunDateKey: turno }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/empresa-copia-de-hubspot] ${turno} — lock ajeno; turno liberado para reintentar`);
      return;
    }
    console.log(
      `[jobs/empresa-copia-de-hubspot] ${turno} — ${r.cambiaron} de ${r.empresas} empresas cambiaron en HubSpot · ${r.aplicados} datos aplicados · ${r.propuestas} propuestas${r.errores.length ? ` · ${r.errores.length} con error` : ""}`,
    );
  },
};

/**
 * Las comunicaciones de HubSpot (iniciativa B, docs/correos-en-el-contexto-plan.md): la copia de los correos, las notas
 * y las llamadas (solo lee HubSpot) y, si queda presupuesto automático, los compromisos de hasta 10 correos enviados. Una
 * corrida por hora; con el candado ajeno, suelta el turno. Sin el SQL, lo dice y no falla.
 */
const comunicacionesHubspot: JobDef = {
  key: "comunicaciones-hubspot",
  shouldRun: (_now, parts) => encendido("comunicaciones-hubspot") && parts.hour >= 6 && parts.hour <= 20,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("comunicaciones-hubspot", turno, now))) return SIN_TURNO;
    const { copiarComunicaciones } = await import("@/lib/comunicaciones/copia-server");
    let r: Awaited<ReturnType<typeof copiarComunicaciones>>;
    try {
      r = await copiarComunicaciones();
    } catch (e) {
      if (esquemaDesactualizado(e)) {
        console.log(`[jobs/comunicaciones-hubspot] ${turno} — falta el SQL 2026-10-18-comunicaciones-de-hubspot.sql`);
        return;
      }
      throw e;
    }
    if (r.locked) {
      await prisma.cronJobState
        .updateMany({ where: { id: "comunicaciones-hubspot", lastRunDateKey: turno }, data: { lastRunDateKey: null } })
        .catch(() => {});
      console.log(`[jobs/comunicaciones-hubspot] ${turno} — lock ajeno; turno liberado para reintentar`);
      return;
    }
    const linea = (n: string, x: (typeof r.porTipo)["correo"]) =>
      x.sinPermiso ? `${n}: sin permiso en HubSpot` : `${n}: ${x.creados} nuevos, ${x.actualizados} con cambios${x.ambiguas ? `, ${x.ambiguas} de dos clientes (no se guardan)` : ""}`;
    console.log(`[jobs/comunicaciones-hubspot] ${turno} — ${linea("correos", r.porTipo.correo)} · ${linea("notas", r.porTipo.nota)} · ${linea("llamadas", r.porTipo.llamada)}`);
    const { compromisosPrendidos } = await import("@/lib/comunicaciones/banderas");
    if (!compromisosPrendidos(process.env) || !(await quedaPresupuesto(now))) return;
    const { leerCompromisosDeCorreos } = await import("@/lib/comunicaciones/compromisos-server");
    const c = await leerCompromisosDeCorreos({ ahora: now });
    if (c.leidos || c.errores) console.log(`[jobs/comunicaciones-hubspot] compromisos: ${c.leidos} correos leídos, ${c.propuestas} propuestas, ${c.porAsignar} por asignar, ${c.errores} con error`);
  },
};

/** La búsqueda en las reuniones (etapa 4c): parte en turnos las transcripciones nuevas o que cambiaron. Una corrida por hora. */
const indiceDeReuniones: JobDef = {
  key: "indice-de-reuniones",
  shouldRun: () => true,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("indice-de-reuniones", turno, now))) return SIN_TURNO;
    const { indexarReuniones } = await import("@/lib/busqueda/indexar-server");
    const r = await indexarReuniones();
    if (r.sinTabla) {
      console.log(`[jobs/indice-de-reuniones] ${turno} — falta el SQL 2026-10-16-busqueda-en-reuniones.sql`);
      return;
    }
    console.log(`[jobs/indice-de-reuniones] ${turno} — ${r.partidas} partidas (${r.turnos} turnos), ${r.sinCambio} sin cambio, faltan ${r.faltan}`);
  },
};

/**
 * Los pedidos a Claude que van por la API Batch (lib/ai/lotes-server.ts; DECISIONS «El gasto de la IA»). Cada tick:
 * manda los pendientes en un lote cuando se juntaron o esperaron 5 minutos (si queda presupuesto automático), mira los
 * lotes enviados cada 3 minutos y, cuando terminan, le pasa cada respuesta al manejador de su tipo. Sin la tabla
 * (scripts/sql/2026-10-18-gasto-de-ia.sql) o sin nada que hacer devuelve SIN_TURNO. Una respuesta que no se pudo
 * aplicar, o un pedido vencido, LANZA (semáforo rojo + Sentry).
 */
const iaLotes: JobDef = {
  key: "ia-lotes",
  shouldRun: () => true,
  run: async (now) => {
    const { correrTickDeLotes } = await import("@/lib/ai/lotes-server");
    const r = await correrTickDeLotes(now);
    if (!r || r.enviados + r.aplicados + r.fallidos + r.vencidos === 0) {
      if (r?.errores.length) console.log(`[jobs/ia-lotes] ${r.errores.join(" · ")}`);
      return SIN_TURNO;
    }
    console.log(`[jobs/ia-lotes] ${r.enviados} enviados, ${r.lotesMirados} lotes mirados, ${r.aplicados} aplicados${r.fallidos ? `, ${r.fallidos} con error` : ""}${r.vencidos ? `, ${r.vencidos} vencidos` : ""}`);
    if (r.fallidos + r.vencidos > 0) {
      const fallo = new Error(`${r.fallidos + r.vencidos} pedido(s) por lote no se aplicaron: ${r.errores.slice(0, 5).join("; ")}`);
      fallo.name = "PedidoEnLoteFallido";
      throw fallo;
    }
  },
};

/**
 * El nombre corto de las tareas (2026-10-20, decisión de Elías; lib/tareas/ia/titulo-corto-server.ts): cada 10 minutos,
 * las tareas abiertas sin nombre corto o cuyo título cambió, de a 40 por pedido a Haiku y como mucho 5 pedidos. Sin
 * nada que nombrar no llama a Claude. Sin el SQL (2026-10-20-titulo-corto-de-la-tarea.sql) avisa y no hace nada; sin
 * presupuesto automático, espera al tick siguiente.
 */
const titulosCortos: JobDef = {
  key: "titulos-cortos",
  shouldRun: () => true,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 10) * 10).padStart(2, "0")}`;
    if (!(await quedaPresupuesto(now))) return SIN_TURNO;
    if (!(await claimDateKey("titulos-cortos", turno, now))) return SIN_TURNO;
    const { escribirTitulosCortos } = await import("@/lib/tareas/ia/titulo-corto-server");
    const r = await escribirTitulosCortos();
    if (r.sinColumna) {
      console.log(`[jobs/titulos-cortos] ${turno} — falta el SQL 2026-10-20-titulo-corto-de-la-tarea.sql`);
      return;
    }
    if (r.tandas === 0) return;
    console.log(`[jobs/titulos-cortos] ${turno} — ${r.escritos} nombres en ${r.tandas} pedidos${r.sinNombre ? `, ${r.sinNombre} sin nombre` : ""}${r.errores ? `, ${r.errores} con error` : ""}`);
    if (r.errores > 0 && r.escritos === 0) throw new Error("El pedido del nombre corto de las tareas falló.");
  },
};

/** El turno de 10 minutos de esta hora («2026-10-25T09:20»), como el de los nombres cortos. */
async function turnoDeDiezMinutos(now: Date): Promise<string> {
  const { crDateParts } = await import("./time");
  const p = crDateParts(now);
  return `${p.dateKey}T${String(p.hour).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 10) * 10).padStart(2, "0")}`;
}

/**
 * El motivo de cada reunión sin texto (T4, 2026-10-25; lib/sessions/motivo-sin-texto-server.ts): cada 10 minutos guarda
 * por qué no dejó texto cada reunión de los últimos 90 días, y lo borra de las que ya tienen. La reunión lo muestra a
 * quien la organizó; INV52 vigila que esté. Sin el SQL (2026-10-25-reuniones-parte-2.sql) avisa y no hace nada.
 */
const reunionesMotivos: JobDef = {
  key: "reuniones-motivos",
  shouldRun: () => true,
  run: async (now) => {
    const turno = await turnoDeDiezMinutos(now);
    if (!(await claimDateKey("reuniones-motivos", turno, now))) return SIN_TURNO;
    const { guardarMotivosSinTexto, hayColumnaDelMotivo } = await import("@/lib/sessions/motivo-sin-texto-server");
    if (!(await hayColumnaDelMotivo())) {
      console.log(`[jobs/reuniones-motivos] ${turno} — falta el SQL 2026-10-25-reuniones-parte-2.sql`);
      return;
    }
    const r = await guardarMotivosSinTexto({ ahora: now });
    if (r.escritas + r.borradas > 0) console.log(`[jobs/reuniones-motivos] ${turno} — ${r.miradas} miradas, ${r.escritas} con motivo nuevo, ${r.borradas} ya con texto`);
  },
};

/**
 * La empresa que propone Nexus para cada reunión con texto sin dueña (T3, 2026-10-25;
 * lib/sessions/propuesta-de-empresa-server.ts), una vez por hora. Lo decide una persona en el tablero de salud o en la
 * reunión. Sin el SQL avisa y no hace nada. HubSpot caído no rompe: las de empresas que Nexus no tiene esperan.
 */
const reunionesPropuestas: JobDef = {
  key: "reuniones-propuestas",
  shouldRun: () => true,
  run: async (now) => {
    const { crDateParts } = await import("./time");
    const p = crDateParts(now);
    const turno = `${p.dateKey}T${String(p.hour).padStart(2, "0")}`;
    if (!(await claimDateKey("reuniones-propuestas", turno, now))) return SIN_TURNO;
    const { calcularPropuestas } = await import("@/lib/sessions/propuesta-de-empresa-server");
    try {
      const r = await calcularPropuestas({ ahora: now });
      if (r.nuevas + r.cambiadas + r.borradas > 0) {
        console.log(`[jobs/reuniones-propuestas] ${turno} — ${r.miradas} sin dueña, ${r.nuevas} propuestas nuevas, ${r.cambiadas} cambiadas, ${r.borradas} borradas${r.sinHubspot ? " (sin HubSpot)" : ""}`);
      }
    } catch (e) {
      if (esquemaDesactualizado(e)) {
        console.log(`[jobs/reuniones-propuestas] ${turno} — falta el SQL 2026-10-25-reuniones-parte-2.sql`);
        return;
      }
      throw e;
    }
  },
};

/**
 * Las transcripciones de audio de las reuniones presenciales (T5, 2026-10-25; lib/sessions/audio-de-reunion-server.ts):
 * cada tick mira las que Google está transcribiendo y guarda el texto de las que terminaron. Gated por REUNIONES_AUDIO=1
 * y GOOGLE_SPEECH_BUCKET. Sin audios en curso devuelve SIN_TURNO. Si Google no se pudo mirar, LANZA (semáforo rojo).
 */
const reunionesAudio: JobDef = {
  key: "reuniones-audio",
  shouldRun: () => encendido("reuniones-audio"),
  run: async (now) => {
    const { mirarAudios } = await import("@/lib/sessions/audio-de-reunion-server");
    const r = await mirarAudios(now).catch((e) => {
      if (esquemaDesactualizado(e)) return null;
      throw e;
    });
    if (!r || (r.mirados === 0 && r.conError === 0)) return SIN_TURNO;
    console.log(`[jobs/reuniones-audio] ${r.mirados} mirados, ${r.listos} transcritos, ${r.conError} con error`);
    if (r.errores.length && r.listos === 0 && r.conError === 0) throw new Error(`No se pudo mirar la transcripción de audio: ${r.errores.slice(0, 3).join("; ")}`);
  },
};

export function allJobs(): JobDef[] {
  return [marketingWeekly, csSignalsDaily, csPartnerDaily, comisionesHubspotEstimado, csWatchdogDaily, csWatchdogDebounce, maintenanceDaily, cobranzaQuincenal, googleMeetSync, googleEnrichRetry, tareasSprint, seguimientoReuniones, ventasGanadasDaily, negociosAbiertos, contactosYTickets, empresaCopiaDeHubspot, comunicacionesHubspot, indiceDeReuniones, tareasHubspot, odooEspejoDaily, mercuryEspejoDaily, tipoCambioDaily, planillaQuincenaDaily, licenciasRenovacionDaily, adopcionRecordatoriosDaily, tareasSemanaLunes, rentabilidadFotoMensual, rentabilidadLecturaMensual, iaLotes, titulosCortos, reunionesMotivos, reunionesPropuestas, reunionesAudio, loPagadoDaily, invariantsDaily];
}
