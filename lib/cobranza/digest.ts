/**
 * lib/cobranza/digest.ts
 *
 * El "corte" de cartera: computa el set de alertas, lo persiste (dedup), lo
 * diffea contra el snapshot anterior y guarda un SnapshotCartera nuevo. El digest
 * resultante es DIFF-BASED: si nada cambió desde el último corte, `sinCambios`
 * es true y la UI/el aviso no molestan. Lo disparan (a) el JobDef cobranza-weekly
 * (lunes ≥7:00 CR, opt-in por COBRANZA_CRON_ENABLED — registrado en lib/jobs/defs.ts)
 * y (b) el botón "Correr corte ahora" (POST /api/cobranza/digest).
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { crDateParts } from "@/lib/jobs/time";
import {
  addDaysISO,
  computeAlertSet,
  computeMetricasCartera,
  diffAlertSets,
  type AlertaDraft,
  type DiffAlertas,
  type MetricasCartera,
} from "./engine";
import { buildCarteraEngineInput } from "./queries";
import { generateCobros, upsertAlertas } from "./mutations";

export interface DigestResult {
  capturedAt: string;
  triggeredBy: string;
  diff: DiffAlertas;
  totalAlertas: number;
  horizonteExtendido: number; // servicios SUSCRIPCION cuyo rolling se extendió
  metricas: MetricasCartera;
}

export async function runCobranzaDigest(now: Date, triggeredBy: string): Promise<DigestResult> {
  const todayISO = crDateParts(now).dateKey; // "hoy" = día calendario de Costa Rica

  // 1. Extender el horizonte rolling de las suscripciones ACTIVAS con plan activo
  //    (generateCobros es idempotente: si no hay cuotas nuevas que crear, no toca nada).
  const suscripciones = await prisma.servicioContratado.findMany({
    where: {
      estado: "ACTIVO",
      fechaInicioFacturacion: { not: null },
      planes: { some: { activo: true, template: "SUSCRIPCION" } },
    },
    select: { id: true },
  });
  let horizonteExtendido = 0;
  for (const s of suscripciones) {
    try {
      const r = await generateCobros(s.id, triggeredBy, todayISO);
      if (r.created > 0) horizonteExtendido++;
    } catch {
      // best-effort: un servicio mal configurado no tumba el corte (queda su alerta SIN_DATOS)
    }
  }

  // 2. Computar el set de alertas de toda la cartera y persistirlo (dedup).
  const cartera = await buildCarteraEngineInput();
  const alertSet = computeAlertSet(cartera, { todayISO });
  await upsertAlertas(alertSet);

  // 3. Diff contra el snapshot anterior (por dedupeKey).
  const anterior = await prisma.snapshotCartera.findFirst({ orderBy: { capturedAt: "desc" } });
  const prevSet: AlertaDraft[] = anterior ? (anterior.alertSet as unknown as AlertaDraft[]) : [];
  const diff = diffAlertSets(prevSet, alertSet);

  // 3b. Métricas del corte (fase 3): ventana desde el corte anterior (null en el
  //     primero — sin backfill, la historia arranca acá) hasta hoy; el proyectado
  //     apunta al corte siguiente (+7d) y ese corte lo comparará con su cobrado.
  const desdeUltimoCorteISO = anterior
    ? anterior.capturedAt.toISOString().slice(0, 10)
    : null;
  const metricas = computeMetricasCartera(cartera, {
    todayISO,
    desdeUltimoCorteISO,
    proximoCorteISO: addDaysISO(todayISO, 7),
  });

  // 4. Guardar el snapshot de esta corrida (fila-por-corrida, payload completo).
  const snap = await prisma.snapshotCartera.create({
    data: {
      alertSet: alertSet as unknown as Prisma.InputJsonValue,
      resumen: {
        nuevas: diff.nuevas,
        resueltas: diff.resueltas,
        persistentes: diff.persistentes,
        sinCambios: diff.sinCambios,
        totalAlertas: alertSet.length,
      } as unknown as Prisma.InputJsonValue,
      metricas: metricas as unknown as Prisma.InputJsonValue,
      triggeredBy,
    },
  });

  return {
    capturedAt: snap.capturedAt.toISOString(),
    triggeredBy,
    diff,
    totalAlertas: alertSet.length,
    horizonteExtendido,
    metricas,
  };
}
