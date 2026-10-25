/**
 * lib/jobs/latido.ts — el LATIDO de cada job a Sentry Crons (U24, 2026-10-25). Sentry avisa cuando un job con cadencia
 * (lib/jobs/cadencias.ts) no manda su latido a tiempo: un job que dejó de correr, aunque el servidor entero se haya caído.
 *
 * Sin `SENTRY_DSN` es un no-op (como todo Sentry en Nexus). El monitor de cada job lo crea el primer latido, con su
 * horario (`monitorConfig`): no hay nada que configurar por job. Lo que sí configura Elías es a quién avisa la alerta de
 * Crons (docs/RUNBOOK.md › «Un job que deja de correr»). Nunca lanza: un latido que no sale no puede tumbar un job.
 */
import * as Sentry from "@sentry/nextjs";
import { CADENCIA_DE_JOB, ZONA_DE_LAS_CADENCIAS } from "./cadencias";

/** El nombre del monitor en Sentry. */
export const monitorDeJob = (key: string) => `nexus-${key}`.slice(0, 50);

export function latido(key: string, estado: "ok" | "error", duracionMs: number): void {
  const c = CADENCIA_DE_JOB[key];
  if (!c) return;
  try {
    const capturar = (Sentry as { captureCheckIn?: typeof Sentry.captureCheckIn }).captureCheckIn;
    if (typeof capturar !== "function") return;
    capturar(
      { monitorSlug: monitorDeJob(key), status: estado, duration: Math.max(0, duracionMs) / 1000 },
      {
        schedule: { type: "crontab", value: c.crontab },
        timezone: ZONA_DE_LAS_CADENCIAS,
        checkinMargin: c.margenMin,
        maxRuntime: c.maxMinutos,
        failureIssueThreshold: 1,
        recoveryThreshold: 1,
      },
    );
  } catch {
    /* un latido que no sale no tumba el job */
  }
}
