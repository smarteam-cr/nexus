/**
 * lib/guia-exploracion/contexto.ts — la guía de exploración como texto para los agentes que vienen
 * después (Planificación, Diagnóstico). Desde el 2026-10-02 reemplaza al informe de exploración:
 * `loadCanvasContext(projectId, "exploration")` devuelve ESTO cuando la guía tiene contenido, y el
 * informe viejo solo si el proyecto todavía no tiene guía (lib/canvas/load-canvas-context.ts).
 *
 * Solo entra lo CONFIRMADO por el CSE: lo que propuso el agente y nadie usó no es un dato.
 *
 * Sin `server-only` a propósito: lo importa lib/canvas/load-canvas-context.ts, que tampoco lo declara
 * y que cargan varias pruebas unitarias.
 */
import { prisma } from "@/lib/db/prisma";
import { NOMBRE_DEL_EQUIPO, NOMBRE_DEL_ROL, leerContenido, type ClaveDeEquipo, type ContenidoDeGuia } from "./contenido";

export function guiaComoTexto(c: ContenidoDeGuia): string {
  const partes: string[] = [];
  if (c.resultados.length) {
    partes.push(
      "[Resultados que el cliente necesita]\n" +
        c.resultados
          .map((r) => `- ${r.que}${r.quien ? ` — lo necesita: ${r.quien}` : ""}${r.paraQue ? ` — para: ${r.paraQue}` : ""}${r.alcance !== "dentro" ? ` (alcance: ${r.alcance === "fuera" ? "FUERA de lo contratado" : "en duda"})` : ""}`)
          .join("\n"),
    );
  }
  for (const [k, e] of Object.entries(c.equipos) as [ClaveDeEquipo, NonNullable<ContenidoDeGuia["equipos"][ClaveDeEquipo]>][]) {
    if (!e.opera.length && !e.trabas.length) continue;
    partes.push(
      `[Equipo de ${NOMBRE_DEL_EQUIPO[k]}]\n` +
        (e.opera.length ? `Cómo opera hoy:\n${e.opera.map((h) => `- ${h.texto}`).join("\n")}\n` : "") +
        (e.trabas.length ? `Dónde se traba:\n${e.trabas.map((h) => `- ${h.texto}`).join("\n")}` : ""),
    );
  }
  const niveles = Object.entries(c.escala);
  if (niveles.length) {
    partes.push(
      "[Escala: niveles confirmados por el CSE en la exploración]\n" +
        niveles.map(([d, n]) => `- ${d}: ${n.nivel}${n.nota ? ` — ${n.nota}` : ""}`).join("\n"),
    );
  }
  const hechas = c.sesiones.flatMap((s) => s.preguntas.filter((q) => q.hecha).map((q) => ({ s, q })));
  if (hechas.length) {
    partes.push(
      "[Lo que se averiguó en las sesiones]\n" +
        hechas.map(({ s, q }) => `- (${s.titulo}) ${q.texto}${q.respuesta ? `\n  → ${q.respuesta}` : ""}`).join("\n"),
    );
  }
  const pendientes = c.sesiones.flatMap((s) => s.preguntas.filter((q) => !q.hecha).map((q) => `- (${s.titulo}) ${q.texto}`));
  if (pendientes.length) partes.push(`[Preguntas del plan que todavía no se hicieron]\n${pendientes.join("\n")}`);
  if (c.personas.length) {
    partes.push(
      "[A quién involucrar]\n" +
        c.personas
          .map((p) => `- ${p.nombre}${p.rol ? ` — ${NOMBRE_DEL_ROL[p.rol]}` : ""}${p.confirmado ? "" : " (rol sin confirmar)"}${p.sabe ? `: ${p.sabe}` : ""}`)
          .join("\n"),
    );
  }
  if (c.noRepreguntar.length) partes.push(`[Ya sabido]\n${c.noRepreguntar.map((d) => `- ${d.texto}`).join("\n")}`);
  if (c.fueraDeAlcance.length) partes.push(`[Fuera de lo contratado]\n${c.fueraDeAlcance.map((d) => `- ${d.texto}`).join("\n")}`);
  return partes.join("\n\n");
}

/** El texto de la guía del proyecto, o "" si no hay guía o está vacía. */
export async function textoDeLaGuia(projectId: string): Promise<string> {
  const f = await prisma.guiaDeExploracion.findUnique({ where: { projectId }, select: { contenido: true } }).catch(() => null);
  return f ? guiaComoTexto(leerContenido(f.contenido)) : "";
}
