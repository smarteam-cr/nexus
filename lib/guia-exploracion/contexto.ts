/**
 * lib/guia-exploracion/contexto.ts — las sesiones de la exploración como texto para los agentes que
 * vienen después (Planificación, Diagnóstico). Desde el 2026-10-02 reemplaza al informe de
 * exploración: `loadCanvasContext(projectId, "exploration")` devuelve ESTO cuando hay sesiones, y el
 * informe viejo solo si el proyecto todavía no tiene (lib/canvas/load-canvas-context.ts).
 *
 * Solo entra lo CONFIRMADO por el CSE: lo que propuso el agente y nadie usó no es un dato. Lo que
 * se sabe del cliente (resultados, personas, dolor, herramientas) ya no viaja acá: está en la ficha
 * (Información del cliente), que esos agentes leen aparte.
 *
 * Sin `server-only` a propósito: lo importa lib/canvas/load-canvas-context.ts, que tampoco lo declara
 * y que cargan varias pruebas unitarias.
 */
import { prisma } from "@/lib/db/prisma";
import { leerContenido, type ContenidoDeGuia } from "./contenido";

export function guiaComoTexto(c: ContenidoDeGuia): string {
  const partes: string[] = [];
  const hechas = c.sesiones.flatMap((s) => s.preguntas.filter((q) => q.hecha).map((q) => ({ s, q })));
  if (hechas.length) {
    partes.push(
      "[Lo que se averiguó en las sesiones de exploración]\n" +
        hechas.map(({ s, q }) => `- (${s.titulo}) ${q.texto}${q.respuesta ? `\n  → ${q.respuesta}` : ""}`).join("\n"),
    );
  }
  const pendientes = c.sesiones.flatMap((s) => s.preguntas.filter((q) => !q.hecha).map((q) => `- (${s.titulo}) ${q.texto}`));
  if (pendientes.length) partes.push(`[Preguntas del plan que todavía no se hicieron]\n${pendientes.join("\n")}`);
  return partes.join("\n\n");
}

/** El texto de las sesiones del proyecto, o "" si no hay o están vacías. */
export async function textoDeLaGuia(projectId: string): Promise<string> {
  const f = await prisma.guiaDeExploracion.findUnique({ where: { projectId }, select: { contenido: true } }).catch(() => null);
  return f ? guiaComoTexto(leerContenido(f.contenido)) : "";
}
