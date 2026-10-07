import "server-only";

/**
 * lib/guia-exploracion/a-la-ficha.ts — lo que el CSE averigua en las sesiones va a Información del
 * cliente, como SUGERENCIA (2026-10-05).
 *
 * Hasta ese día la exploración guardaba lo que se sabía del cliente en su propia guía, y repetía la
 * ficha. Ahora, al guardar un «lo que averiguaste», se lo pasa a la puerta 4 de la ficha
 * (lib/clients/ficha-propuesta.ts) y la respuesta anota en cada pregunta a qué campos llegó, para
 * que la pantalla lo diga («Llegó como sugerencia a Información del cliente › Dolor principal»).
 *
 * Corre DESPUÉS de responder el guardado y nunca lanza: una ficha que no se actualiza no puede
 * tumbar el guardado de una sesión. Anotar no sube la versión de la guía (no es un cambio del CSE):
 * el próximo guardado del CSE parte de la fila bloqueada y la arrastra.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { proponerFichaDesdeLoAveriguado } from "@/lib/clients/ficha-propuesta";
import { anotarFichaCampos, leerContenido, type Averiguado } from "./contenido";

export function llevarLoAveriguadoALaFicha(projectId: string, averiguado: readonly Averiguado[], triggeredByEmail: string | null): void {
  if (!averiguado.length) return;
  void (async () => {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (!project?.clientId) return;
    const porSesion = new Map<string, { titulo: string; preguntas: Array<{ pregunta: string; respuesta: string }> }>();
    for (const a of averiguado) {
      const s = porSesion.get(a.sesionId) ?? { titulo: a.sesion, preguntas: [] };
      s.preguntas.push({ pregunta: a.pregunta, respuesta: a.respuesta });
      porSesion.set(a.sesionId, s);
    }
    const r = await proponerFichaDesdeLoAveriguado({
      clientId: project.clientId,
      projectId,
      sesiones: [...porSesion.values()],
      triggeredByEmail,
    });
    if (r.status !== "ok") {
      if (r.status === "error") console.error("[guia-exploracion] lo averiguado no llegó a la ficha:", r.error);
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GuiaDeExploracion" WHERE "projectId" = ${projectId} FOR UPDATE`;
      const f = await tx.guiaDeExploracion.findUnique({ where: { projectId }, select: { contenido: true } });
      if (!f) return;
      const contenido = anotarFichaCampos(leerContenido(f.contenido), averiguado, r.campos);
      await tx.guiaDeExploracion.update({ where: { projectId }, data: { contenido: contenido as unknown as Prisma.InputJsonValue } });
    });
  })().catch((e) => console.error("[guia-exploracion] lo averiguado no llegó a la ficha:", e instanceof Error ? e.message : e));
}
