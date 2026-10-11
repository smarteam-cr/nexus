/**
 * lib/pieces/estado-de-cuestionarios-server.ts — lee de la base lo que necesita la fila de los
 * Cuestionarios en el riel (lib/pieces/estado-de-cuestionarios.ts). SERVER-ONLY.
 *
 * Una sola consulta liviana: de cada cuestionario, si está publicado o cerrado y qué pestañas se
 * enviaron. No lee preguntas ni respuestas. El «Ahora no» de la sugerencia sale de las secciones del
 * canvas del Kickoff, que quien llama ya tiene cargadas (el listado de canvases).
 *
 * Si la lectura falla devuelve null: la fila se pinta sin estado en vez de tumbar el listado entero.
 */
import { prisma } from "@/lib/db/prisma";
import { estadoDeCuestionarios, sugerenciaDescartadaEn, type EstadoDeCuestionarios } from "./estado-de-cuestionarios";

export async function cargarEstadoDeCuestionarios(
  projectId: string,
  seccionesDelKickoff: unknown,
): Promise<EstadoDeCuestionarios | null> {
  try {
    const lista = await prisma.cuestionario.findMany({
      where: { projectId },
      select: { publicadoAt: true, cerradoAt: true, pestanas: { select: { enviadaAt: true } } },
    });
    return estadoDeCuestionarios(lista, sugerenciaDescartadaEn(seccionesDelKickoff));
  } catch (e) {
    console.error("[estado-de-cuestionarios] no se pudo leer", e instanceof Error ? e.message : e);
    return null;
  }
}
