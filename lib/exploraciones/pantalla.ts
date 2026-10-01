/**
 * lib/exploraciones/pantalla.ts — lo que el lienzo recibe al abrirse y al recargarse. SERVIDOR.
 *
 * La fila (servidor.ts) más lo que cuesta una consulta y por eso no viaja en la respuesta de cada
 * cambio: las reuniones que el agente todavía no leyó, los proyectos cuyo handoff ya recibe la
 * exploración y lo que el vendedor sumó a mano. Si alguna falla, el lienzo abre igual, sin ella.
 */
import "server-only";
import { listarDocumentos } from "./documentos";
import { reunionesSinLeer } from "./fuentes";
import { proyectosQueLaReciben } from "./handoff";
import { leerLoLeido } from "./lo-leido";
import { paraLaPantalla, type ExploracionParaLaPantalla, type FilaDeExploracion } from "./servidor";

export async function paraLaPantallaCompleta(fila: FilaDeExploracion): Promise<ExploracionParaLaPantalla> {
  const exp = paraLaPantalla(fila);
  const [sinLeer, proyectos, documentos] = await Promise.all([
    reunionesSinLeer({
      exploracionId: fila.id,
      clientId: fila.client.id,
      creadaEn: fila.createdAt,
      propuesta: exp.estado.propuesta,
      // La foto ENTERA: las agendadas que ya pasaron son justamente las que se avisan como «sin leer».
      leido: leerLoLeido(fila.test),
    }).catch((e) => {
      console.error("[exploraciones] no se pudieron contar las reuniones sin leer", e);
      return [];
    }),
    proyectosQueLaReciben(fila.id, fila.client.id, fila.createdAt).catch((e) => {
      console.error("[exploraciones] no se pudieron buscar los proyectos que la reciben", e);
      return [];
    }),
    listarDocumentos(fila.id).catch((e) => {
      console.error("[exploraciones] no se pudieron listar los documentos", e);
      return [];
    }),
  ]);
  return { ...exp, sinLeer, proyectos, documentos };
}
