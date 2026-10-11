/**
 * lib/exploraciones/pantalla.ts — lo que el lienzo recibe al abrirse y al recargarse. SERVIDOR.
 *
 * La fila (servidor.ts) más lo que cuesta una consulta y por eso no viaja en la respuesta de cada
 * cambio: las reuniones que el agente todavía no leyó, los proyectos cuyo handoff ya recibe la
 * exploración, lo que el vendedor sumó a mano y las propuestas que nacieron de ella. Si alguna
 * falla, el lienzo abre igual, sin ella.
 *
 * Las reuniones son SOLO las de la exploración (etapa A, 2026-10-09): las de sus sesiones (en un
 * prospecto, también las que entraron solas), lo que fue de la exploración y ya no es sesión («Fuera de
 * la exploración») y lo sumado a mano. «Lo que la IA ya sabe» (`loQueSabeLaIA`) sale de la memoria
 * (lib/memoria › `queSabeLaIA`, etapa 3): conteos, nunca el contenido. Lo muestra la página de inicio
 * (components/exploraciones/InicioDeLaExploracion.tsx).
 */
import "server-only";
import { queSabeLaIA } from "@/lib/memoria";
import { listarDocumentos } from "./documentos";
import { reunionesDeLaExploracion, reunionesSinLeer } from "./fuentes";
import { proyectosQueLaReciben } from "./handoff";
import { leerLoLeido } from "./lo-leido";
import { propuestasDeLaExploracion } from "./propuesta";
import { paraLaPantalla, type ExploracionParaLaPantalla, type FilaDeExploracion, type LoQueSabeLaIA } from "./servidor";

export async function paraLaPantallaCompleta(fila: FilaDeExploracion): Promise<ExploracionParaLaPantalla> {
  const exp = paraLaPantalla(fila);
  // La exploración de un proyecto no le llega a otro handoff ni arma propuestas: eso es de la preventa.
  const delProyecto = !!fila.projectId;
  const [sinLeer, proyectos, documentos, propuestas, reuniones, sabe] = await Promise.all([
    reunionesSinLeer({
      exploracionId: fila.id,
      clientId: fila.client.id,
      projectId: fila.projectId,
      creadaEn: fila.createdAt,
      propuesta: exp.estado.propuesta,
      // La foto ENTERA: las agendadas que ya pasaron son justamente las que se avisan como «sin leer».
      leido: leerLoLeido(fila.test),
      sesiones: exp.estado.contenido.sesiones,
      fuera: exp.estado.contenido.fuera,
      elegidas: exp.estado.contenido.reunionesElegidas,
    }).catch((e) => {
      console.error("[exploraciones] no se pudieron contar las reuniones sin leer", e);
      return [];
    }),
    (delProyecto ? Promise.resolve([]) : proyectosQueLaReciben(fila.id, fila.client.id, fila.createdAt)).catch((e) => {
      console.error("[exploraciones] no se pudieron buscar los proyectos que la reciben", e);
      return [];
    }),
    listarDocumentos(fila.id).catch((e) => {
      console.error("[exploraciones] no se pudieron listar los documentos", e);
      return [];
    }),
    (delProyecto ? Promise.resolve([]) : propuestasDeLaExploracion(fila.id)).catch((e) => {
      console.error("[exploraciones] no se pudieron listar las propuestas", e);
      return [];
    }),
    reunionesDeLaExploracion({
      exploracionId: fila.id,
      clientId: fila.client.id,
      projectId: fila.projectId,
      creadaEn: fila.createdAt,
      propuesta: exp.estado.propuesta,
      leido: leerLoLeido(fila.test),
      sesiones: exp.estado.contenido.sesiones,
      fuera: exp.estado.contenido.fuera,
      elegidas: exp.estado.contenido.reunionesElegidas,
    }).catch((e) => {
      console.error("[exploraciones] no se pudieron listar las reuniones", e);
      return [];
    }),
    queSabeLaIA(fila.client.id, fila.projectId).catch((e) => {
      console.error("[exploraciones] no se pudo calcular «Lo que la IA ya sabe»", e);
      return null;
    }),
  ]);
  const loQueSabeLaIA: LoQueSabeLaIA | undefined = sabe
    ? {
        ficha: { confirmados: sabe.ficha.confirmados, propuestos: sabe.ficha.propuestos },
        propuestosPorOrigen: sabe.ficha.propuestosPorOrigen,
        ...(sabe.handoff ? { handoff: sabe.handoff.hay, handoffCongeladoAt: sabe.handoff.congeladoAt, handoffVia: sabe.handoff.via } : {}),
        ...(sabe.reunionesConMinuta !== null ? { reunionesConMinuta: sabe.reunionesConMinuta } : {}),
        ...(sabe.preventa ? { preventa: sabe.preventa } : {}),
        // En la preventa: si el contacto hizo el test (lo que el agente leyó de HubSpot).
        ...(!fila.projectId ? { test: leerLoLeido(fila.test).tests.length > 0 } : {}),
        memoriaUrl: null,
      }
    : undefined;
  return { ...exp, sinLeer, proyectos, documentos, propuestas, reuniones, ...(loQueSabeLaIA ? { loQueSabeLaIA } : {}) };
}
