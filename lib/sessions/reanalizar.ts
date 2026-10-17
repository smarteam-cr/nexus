/**
 * lib/sessions/reanalizar.ts — qué pasa con la lectura de una reunión cuando su TEXTO cambia.
 *
 * Lo llama el enriquecimiento (lib/google/meet-enrichment.ts) en vez de encolar a secas, solo cuando la transcripción
 * que acaba de leer es distinta de la que estaba guardada (la huella md5). Si el texto es el primero o el mismo de
 * siempre, el enriquecimiento encola como siempre y esto no corre.
 *
 * Con el texto cambiado aplica la regla de lib/sessions/analisis-ajeno.ts:
 *   · rehacer (nadie tocó nada y es reciente): borra la minuta en borrador y los pedidos de esa corrida, retira los
 *     hechos pendientes (lib/seguimiento) y vuelve a encolar la lectura aunque estuviera lista (lib/lecturas);
 *   · avisar (alguien ya trabajó algo): no pisa nada y le avisa a quien lo trabajó y al encargado del proyecto;
 *   · nada (reunión vieja): se rehace a mano desde la reunión.
 * Las propuestas de Tarea que nadie decidió no se tocan desde acá (las escribe solo lib/tareas): vencen solas.
 * NUNCA lanza: un error se loguea y la reunión queda como estaba.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { ANALISIS_AUTOMATICO_HASTA_MS, decidirTrasCambioDeTexto, planDeLimpieza, type DecisionTrasCambio } from "./analisis-ajeno";
import { cargarAnalisis, limpiarAnalisis, type AnalisisDeLaReunion } from "./analisis-ajeno-db";

/** La nota con que quedan los hechos pendientes de una lectura hecha con el texto de otra reunión. */
export const NOTA_TEXTO_NUEVO = "El texto de la reunión cambió: se vuelve a leer con el nuevo";

export async function alCambiarElTexto(sessionId: string, huellaNueva: string, ahora = new Date()): Promise<DecisionTrasCambio | null> {
  try {
    const sesion = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { title: true, date: true } });
    if (!sesion) return null;
    const analisis = await cargarAnalisis(prisma, sessionId);
    const reciente = +ahora - sesion.date.getTime() <= ANALISIS_AUTOMATICO_HASTA_MS;
    const d = decidirTrasCambioDeTexto(analisis, { reciente });
    console.log(`[reanalizar] «${sesion.title}» cambió de texto → ${d.accion}: ${d.motivo}`);

    if (d.accion === "leer" || d.accion === "rehacer") {
      if (d.accion === "rehacer") {
        const plan = await limpiarAnalisis(prisma, sessionId);
        let hechos = 0;
        if (plan.hechosARetirar.length) {
          const { retirarHechos } = await import("@/lib/seguimiento/hechos-server");
          hechos = await retirarHechos(plan.hechosARetirar, NOTA_TEXTO_NUEVO, ahora).catch(() => 0);
        }
        console.log(
          `[reanalizar] «${sesion.title}»: se borraron ${plan.minutaABorrar ? "la minuta" : "0 minutas"} y ${plan.pedidosABorrar.length} pedido(s); ` +
            `se retiraron ${hechos} hecho(s); quedan ${plan.propuestasSinDecidir.length} tarea(s) propuesta(s) sin decidir (vencen solas)`,
        );
      }
      const { reencolarPorTextoNuevo } = await import("@/lib/lecturas/cola");
      await reencolarPorTextoNuevo(sessionId, ahora);
    } else if (d.accion === "avisar") {
      await avisarCambioDeTexto(sessionId, sesion.title, analisis, huellaNueva);
    }
    return d;
  } catch (e) {
    console.error(`[reanalizar] la reunión ${sessionId} cambió de texto y no se pudo decidir qué hacer:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Le avisa a quien trabajó la minuta, las tareas o los pedidos (y al encargado del proyecto) que el texto cambió. */
async function avisarCambioDeTexto(sessionId: string, titulo: string, a: AnalisisDeLaReunion, huella: string): Promise<void> {
  const plan = planDeLimpieza(a);
  const proyecto = a.proyectoId
    ? await prisma.project.findUnique({ where: { id: a.proyectoId }, select: { hubspotOwnerEmail: true } })
    : null;
  const para = [
    a.minuta?.reviewedByEmail,
    ...plan.tareasDecididas.map((t) => t.responsableEmail),
    ...plan.hechosUsados.map((h) => h.decididoPorEmail),
    proyecto?.hubspotOwnerEmail,
  ];
  const n = await avisar({
    para,
    tipo: "reunion.texto-cambio",
    titulo: `«${titulo}» cambió de texto después de leerse`,
    detalle:
      "Lo que dejó la lectura (la minuta, las tareas propuestas, los pedidos) salió de otro texto de la reunión. Como alguien " +
      "ya lo revisó o lo trabajó, no se rehízo solo: revisa si sigue valiendo.",
    href: `/sessions/${encodeURIComponent(sessionId)}`,
    dedupeKey: `reunion.texto-cambio:${sessionId}:${huella}`,
  });
  if (n === 0) console.log(`[reanalizar] «${titulo}»: no había a quién avisar`);
}
