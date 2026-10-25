/**
 * lib/jobs/cadencias.ts — CADA CUÁNTO DEBERÍA CORRER CADA JOB, para saber cuándo DEJÓ de correr (U24, 2026-10-25). PURO.
 *
 * Un job que falla ya avisa (rojo en Integraciones, Sentry y «Para ti»). Uno que deja de correr no avisaba: el barrido
 * del vigía nunca corrió en producción y nadie lo supo (docs/integraciones-finanzas-ia-plan.md › U24). Dos vías, con la
 * MISMA tabla:
 *   · Sentry Crons (lib/jobs/latido.ts): cada corrida le manda un latido con su horario; si no llega a tiempo, Sentry
 *     avisa. Sirve aunque se caiga el servidor entero. La alerta la configura Elías en Sentry (RUNBOOK).
 *   · el job `jobs-vigia` (cada hora): si un job que ya corrió alguna vez lleva más de `horasSinCorrer` sin anotar una
 *     corrida, el vigía LANZA, y ese fallo llega como cualquier otro: rojo en Integraciones, Sentry y «Para ti» de quien
 *     ve el sistema (hoy, Elías). Un job apagado a propósito (`motivoApagado`) no cuenta.
 *
 * Solo entran los jobs que anotan una corrida cada vez que les toca. Los que devuelven SIN_TURNO cuando no tienen nada
 * que hacer (la cola de lecturas, los lotes, el debounce del vigía) no: su silencio es normal. La copia de Meet tampoco:
 * lanza su corrida sin esperarla y anota en su propia fila (`google-auto-sync`); su frescura la vigila INV49.
 */

export interface Cadencia {
  /** El horario en formato crontab, en hora de Costa Rica (para Sentry Crons). */
  crontab: string;
  /** Cuántos minutos después de la hora puede llegar el latido (el tick es de un minuto y una corrida puede esperar). */
  margenMin: number;
  /** Cuánto puede durar una corrida antes de que Sentry la dé por colgada. */
  maxMinutos: number;
  /** Cuántas horas sin una corrida anotada son «dejó de correr» para el vigía (cubre la noche o el fin de semana). */
  horasSinCorrer: number;
}

const CADA_HORA_DE_DIA: Cadencia = { crontab: "0 6-20 * * *", margenMin: 59, maxMinutos: 30, horasSinCorrer: 11 };
const DIARIO: (hora: number) => Cadencia = (hora) => ({ crontab: `0 ${hora} * * *`, margenMin: 240, maxMinutos: 60, horasSinCorrer: 26 });
const DIAS_HABILES: (hora: number) => Cadencia = (hora) => ({ crontab: `0 ${hora} * * 1-5`, margenMin: 240, maxMinutos: 60, horasSinCorrer: 74 });

export const ZONA_DE_LAS_CADENCIAS = "America/Costa_Rica";

export const CADENCIA_DE_JOB: Readonly<Record<string, Cadencia>> = {
  "negocios-abiertos": CADA_HORA_DE_DIA,
  "contactos-y-tickets": CADA_HORA_DE_DIA,
  "comunicaciones-hubspot": CADA_HORA_DE_DIA,
  "hubspot-leads": CADA_HORA_DE_DIA,
  "odoo-espejo-daily": { crontab: "0 6-19 * * *", margenMin: 59, maxMinutos: 30, horasSinCorrer: 12 },
  "mercury-espejo-daily": { crontab: "0 6-19 * * *", margenMin: 59, maxMinutos: 30, horasSinCorrer: 12 },
  "indice-de-reuniones": { crontab: "0 * * * *", margenMin: 59, maxMinutos: 30, horasSinCorrer: 2 },
  "ventas-ganadas-daily": DIARIO(6),
  "tipo-cambio-daily": DIARIO(6),
  "hubspot-fusiones": DIARIO(6),
  "hubspot-proyectos": DIARIO(6),
  "invariants-daily": DIARIO(7),
  "cs-signals-daily": DIAS_HABILES(6),
  "cs-partner-daily": DIAS_HABILES(6),
  "cs-watchdog-daily": DIAS_HABILES(7),
  "jobs-vigia": { crontab: "0 * * * *", margenMin: 59, maxMinutos: 10, horasSinCorrer: 3 },
};

export interface EstadoParaElVigia {
  key: string;
  /** La última corrida anotada (buena o mala): `CronJobState.lastResult.at`. null = nunca corrió en esta base. */
  ultimaCorrida: Date | null;
  /** Apagado a propósito o sin credenciales (`motivoApagado`). */
  apagado: boolean;
}

export interface JobCallado {
  key: string;
  ultimaCorrida: Date;
  horas: number;
}

/**
 * Los jobs que dejaron de correr: con cadencia, encendidos, que corrieron alguna vez y cuya última corrida tiene más de
 * `horasSinCorrer`. Uno que nunca corrió no cuenta (eso no es «dejó de correr»: es un job que nunca se prendió, y lo dice
 * Integraciones). El vigía no se mira a sí mismo.
 */
export function jobsQueDejaronDeCorrer(estados: readonly EstadoParaElVigia[], ahora: Date): JobCallado[] {
  const out: JobCallado[] = [];
  for (const e of estados) {
    const c = CADENCIA_DE_JOB[e.key];
    if (!c || e.key === "jobs-vigia" || e.apagado || !e.ultimaCorrida) continue;
    const horas = (+ahora - +e.ultimaCorrida) / 3_600_000;
    if (horas > c.horasSinCorrer) out.push({ key: e.key, ultimaCorrida: e.ultimaCorrida, horas: Math.floor(horas) });
  }
  return out.sort((a, b) => b.horas - a.horas);
}
