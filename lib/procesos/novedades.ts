import "server-only";
/**
 * lib/procesos/novedades.ts — «Volver a mapear»: las reuniones nuevas que describen cómo trabaja hoy el cliente
 * (memoria de la cuenta, etapa 6). SERVIDOR.
 *
 * Procesos conserva su lectura propia: es por paso (quién, herramienta, momento, estado), con Opus y solo a pedido. Por
 * eso un hecho `proceso_hoy` de una reunión no alimenta el mapa: solo avisa en «Qué sigue» que hay reuniones nuevas
 * desde el último mapeo (docs/DECISIONS.md «Hechos, enrutador y novedades»). Al terminar un mapeo, los hechos de las
 * reuniones que leyó quedan usados (`marcarProcesosUsados`, lib/seguimiento/hechos-server.ts), y el aviso se va solo.
 *
 * ⛔ Con `SEGUIMIENTO_HECHOS` apagada o sin el SQL de los hechos, devuelve 0: el aviso no se ve.
 */
import { prisma } from "@/lib/db/prisma";
import { hechosDeProcesoHoyPendientes } from "@/lib/seguimiento/novedades-server";
import { reunionesConProcesoHoy } from "@/lib/seguimiento/novedades";
import { SLUG_DEL_MAPEO } from "./agente";

/** Cuántas reuniones, desde el último mapeo que terminó, dejaron hechos de cómo trabaja hoy el cliente. Nunca lanza. */
export async function reunionesNuevasParaProcesos(clientId: string, ahora = new Date()): Promise<number> {
  try {
    const hechos = await hechosDeProcesoHoyPendientes(clientId, ahora);
    if (!hechos.length) return 0;
    const ultimo = await prisma.agentRun.findFirst({
      where: { clientId, agentSlug: SLUG_DEL_MAPEO, status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return reunionesConProcesoHoy(hechos, ultimo?.createdAt ?? null, ahora);
  } catch (e) {
    console.error("[procesos] las reuniones nuevas no se pudieron contar (no bloqueante):", e instanceof Error ? e.message : e);
    return 0;
  }
}
