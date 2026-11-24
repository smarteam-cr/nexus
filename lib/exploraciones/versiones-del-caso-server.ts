import "server-only";

/**
 * lib/exploraciones/versiones-del-caso-server.ts — la versión «Cambiado con Nexus» de un caso de uso de la preventa (23 nov,
 * etapa 3 del plan maestro de «Hablar con Nexus»). SERVIDOR.
 *
 * «Mejorar con IA» de las actividades (./mejorar-actividades.ts) conserva su nombre y su lugar: propone, y la persona
 * aplica por la MISMA operación de la edición a mano (`casoDeUso`, en el PATCH de la exploración, que choca si otra persona
 * cambió la preventa). La pantalla marca ese PATCH con `deNexus` (el pedido) y la ruta, después de guardar, llama acá: el
 * historial guarda lo de antes y lo que quedó (`VersionDeDocumento` de la exploración, pieza `caso:<id>`). Lo que lee la
 * mejora (lo que confirmó el equipo y lo que aceptó el cliente) ya lo trae `contextoDePersonalizar` desde la etapa 1.
 *
 * Todavía no hay un popup para el historial de un caso: las versiones quedan para cuando lo haya y para la etapa 4 (lo que
 * cambias vuelve a lo que se sabe compara el antes y el después). Nunca lanza (lo hace `guardarVersion`).
 */
import { guardarVersion } from "@/lib/versiones/guardar-server";
import { huellaDeContenido } from "@/lib/versiones/historial";
import type { EstadoDeExploracion, Operacion } from "./contenido";

/** La pieza de `VersionDeDocumento` que es un caso de uso de la preventa. */
export const piezaDelCaso = (useCaseId: string): string => `caso:${useCaseId}`;

/** Lo de antes y «Cambiado con Nexus» de cada caso que tocaron estas operaciones. */
export async function guardarLaMejoraDeLosCasos(o: {
  exploracionId: string;
  operaciones: readonly Operacion[];
  antes: EstadoDeExploracion;
  despues: EstadoDeExploracion;
  instruccion: string;
  email: string | null;
}): Promise<void> {
  const casos = [...new Set(o.operaciones.flatMap((op) => (op.op === "casoDeUso" ? [op.useCaseId] : [])))];
  const pedido = o.instruccion.replace(/\s+/g, " ").trim();
  for (const useCaseId of casos) {
    const dueno = { exploracionId: o.exploracionId, pieza: piezaDelCaso(useCaseId) };
    const antes = o.antes.contenido.casosDeUso[useCaseId];
    const despues = o.despues.contenido.casosDeUso[useCaseId];
    if (antes) await guardarVersion(dueno, { tipo: "antes", nota: "Así estaba antes de la mejora de Nexus.", creadaPor: null, huella: huellaDeContenido(antes), contenido: antes });
    if (despues)
      await guardarVersion(dueno, {
        tipo: "nexus",
        nota: `Pedido: «${pedido.slice(0, 160)}${pedido.length > 160 ? "…" : ""}»`,
        creadaPor: o.email,
        huella: huellaDeContenido(despues),
        contenido: despues,
      });
  }
}
