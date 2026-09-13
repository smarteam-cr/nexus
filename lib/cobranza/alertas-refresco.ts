/**
 * lib/cobranza/alertas-refresco.ts
 *
 * El refresco de las alertas de cobranza, una vez por noche. Lo corre `maintenance-daily`
 * (lib/jobs/defs.ts), que ya corre en producción todos los días y no depende de ninguna variable
 * del .env.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * Hasta el 2026-09-12 lo único que ponía al día las alertas era el corte quincenal. Apagado desde
 * el 24-jul, el feed era una foto de ese día; y aun encendido, una promesa que vencía el día 2 no
 * subía a «Promesa incumplida» hasta el 15. La decisión 5 de Alex dice que la alerta sube cuando la
 * fecha pasa, no dos semanas después.
 *
 * Qué abre, qué pone al día y qué cierra: lib/cobranza/alertas-cierre.ts.
 *
 * ⛔ NO es un corte. No extiende las suscripciones y no guarda la foto de la cartera ni sus
 * métricas. «Cobrado vs proyectado» y el diff de la quincena comparan un corte con el anterior: si
 * esto guardara una foto por noche, el corte siguiente se compararía contra ayer.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { computeAlertSet } from "./engine";
import { buildCarteraEngineInput } from "./queries";
import { cerrarAlertasQueYaNoAplican, upsertAlertas } from "./mutations";
import { borradoresDelRefresco, cuentasEvaluadas, TIPOS_DEL_MOTOR } from "./alertas-cierre";

export interface ResultadoRefresco {
  /** El día de Costa Rica con que se evaluó la cartera. */
  hoy: string;
  creadas: number;
  fundidas: number;
  suprimidas: number;
  cerradas: number;
}

export async function refrescarAlertasDeCobranza(now: Date): Promise<ResultadoRefresco> {
  // «Hoy» es el día calendario de Costa Rica, igual que en el corte: a las 00:05 CR ya es mañana.
  const hoy = crDateParts(now).dateKey;
  const cartera = await buildCarteraEngineInput();
  const set = computeAlertSet(cartera, { todayISO: hoy });

  /* Las filas vivas hacen falta ANTES del upsert para saber qué borradores caen sobre una fila que
     ya está en el feed (esas se ponen al día aunque no sean deuda). */
  const vivas = await prisma.alertaCobro.findMany({
    where: {
      estado: { in: ["ABIERTA", "VISTA"] },
      cuentaId: { in: [...cuentasEvaluadas(cartera)] },
      tipo: { in: [...TIPOS_DEL_MOTOR] },
    },
    select: { id: true, dedupeKey: true, tipo: true, urgencia: true, cobroId: true, lastDetectedAt: true },
  });
  const r = await upsertAlertas(borradoresDelRefresco(set, vivas));

  // ⚠ El cierre se mide contra el set COMPLETO, no contra lo que se acaba de abrir.
  const cerradas = await cerrarAlertasQueYaNoAplican(cartera, set);

  return { hoy, creadas: r.created, fundidas: r.merged, suprimidas: r.suppressed, cerradas };
}
