/**
 * lib/sessions/analisis-ajeno-db.ts — leer y limpiar lo que dejó la lectura de UNA reunión (la minuta, las propuestas
 * de Tarea, los pedidos fuera de alcance de esa corrida y los hechos). La regla de qué se borra vive en
 * `analisis-ajeno.ts` (pura); acá solo se lee y se escribe.
 *
 * Recibe el cliente de Prisma en vez de importarlo: lo usa el servidor (lib/sessions/reanalizar.ts) y también el script
 * de limpieza, que tiene su propio cliente con el pool acotado de los scripts.
 *
 * Lo que NO escribe, a propósito:
 *   · las tareas: las escribe solo lib/tareas/mutaciones.ts (su guarda lo vigila). Acá se LEEN para decidir;
 *   · los hechos: los retira lib/seguimiento/hechos-server.ts (`retirarHechos`), que también los saca de su módulo;
 *   · la cola: la vuelve a encolar lib/lecturas/cola.ts (`reencolarPorTextoNuevo`).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { planDeLimpieza, type AnalisisGuardado, type PlanDeLimpieza } from "./analisis-ajeno";

type Db = Prisma.TransactionClient | PrismaClient;

export type AnalisisDeLaReunion = AnalisisGuardado & {
  /** El proyecto de la corrida que escribió la minuta (para avisarle a su encargado). */
  proyectoId: string | null;
};

/** ¿Está la tabla de los hechos? (etapa 6; sin su SQL la consulta fallaría). */
function hayHechos(db: Db): boolean {
  return typeof (db as unknown as { hechoDeReunion?: unknown }).hechoDeReunion === "object";
}

/** Lo que dejó la lectura de una reunión, tal como lo necesita `planDeLimpieza`. */
export async function cargarAnalisis(db: Db, sessionId: string): Promise<AnalisisDeLaReunion> {
  const [minuta, tareas, pedidos, hechos] = await Promise.all([
    db.sessionMinute.findUnique({
      where: { sessionId },
      select: { id: true, status: true, reviewedAt: true, reviewedByEmail: true, createdAt: true, generatedByAgentRunId: true },
    }),
    db.tarea.findMany({
      where: { sessionId },
      select: { id: true, estado: true, origenId: true, responsableEmail: true, decididaAt: true },
    }),
    db.pedidoFueraDeAlcance.findMany({
      where: { sessionId },
      select: { id: true, estado: true, decididoAt: true, createdAt: true },
    }),
    hayHechos(db)
      ? db.hechoDeReunion.findMany({ where: { sessionId }, select: { id: true, estado: true, decididoPorEmail: true } }).catch((e) => {
          // Solo se tolera que falte la tabla (su SQL): cualquier otro error cambiaría la decisión en silencio (sin hechos
          // usados, se rehace lo que alguien ya trabajó).
          if (esquemaDesactualizado(e)) return [];
          throw e;
        })
      : Promise.resolve([]),
  ]);
  const corrida = minuta?.generatedByAgentRunId
    ? await db.agentRun.findUnique({ where: { id: minuta.generatedByAgentRunId }, select: { createdAt: true, projectId: true } })
    : null;
  return {
    minuta: minuta
      ? { id: minuta.id, status: String(minuta.status), reviewedAt: minuta.reviewedAt, reviewedByEmail: minuta.reviewedByEmail, createdAt: minuta.createdAt }
      : null,
    corridaAt: corrida?.createdAt ?? null,
    tareas,
    pedidos: pedidos.map((p) => ({ ...p, estado: String(p.estado) })),
    hechos,
    proyectoId: corrida?.projectId ?? null,
  };
}

export interface OpcionesDeLimpieza {
  /** Quitar además el texto de la reunión (transcripción, resumen y temas): era de otra reunión. */
  vaciarTexto?: boolean;
  /** Volver a encolar el enriquecimiento: la próxima pasada relee el material de Google. */
  reencolarEnriquecimiento?: boolean;
  /**
   * Corre DENTRO de la misma transacción, después de borrar: lib/sessions/reanalizar.ts deja ahí la fila de la cola
   * lista para releerse (lib/lecturas/cola.ts `prepararParaReleerEnTx`, su escritor). Así una lectura que se estaba
   * haciendo con el texto viejo no deja su minuta sin que nadie la vuelva a leer.
   */
  enLaMismaTransaccion?: (tx: Prisma.TransactionClient) => Promise<unknown>;
}

/**
 * Borra la minuta en borrador y los pedidos de esa corrida, salvo lo que alguien tocó. Relee y vuelve a planificar
 * DENTRO de la transacción: si una persona revisó la minuta entre el simulacro y la escritura, se queda. Devuelve el plan
 * que se aplicó (con los hechos a retirar y las propuestas sin decidir, que se manejan afuera).
 */
export async function limpiarAnalisis(db: PrismaClient, sessionId: string, opts: OpcionesDeLimpieza = {}): Promise<PlanDeLimpieza> {
  return db.$transaction(async (tx) => {
    const plan = planDeLimpieza(await cargarAnalisis(tx, sessionId));
    if (plan.pedidosABorrar.length > 0) {
      // Las condiciones repiten la regla: lo que cambió desde la lectura de arriba no se borra.
      await tx.pedidoFueraDeAlcance.deleteMany({ where: { id: { in: plan.pedidosABorrar }, decididoAt: null } });
    }
    if (plan.minutaABorrar) {
      await tx.sessionMinute.deleteMany({ where: { id: plan.minutaABorrar, status: "DRAFT", reviewedAt: null } });
    }
    if (opts.vaciarTexto || opts.reencolarEnriquecimiento) {
      await tx.firefliesSession.update({
        where: { id: sessionId },
        data: {
          ...(opts.vaciarTexto ? { transcript: null, summary: Prisma.DbNull, detectedTopics: [] } : {}),
          ...(opts.reencolarEnriquecimiento ? { enrichedAt: null, enrichAttempts: 0, enrichError: null } : {}),
        },
        select: { id: true },
      });
    }
    if (opts.enLaMismaTransaccion) await opts.enLaMismaTransaccion(tx);
    return plan;
  });
}
