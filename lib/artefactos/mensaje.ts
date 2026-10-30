/**
 * lib/artefactos/mensaje.ts — el MENSAJE con que se genera una copia (lib/artefactos/generar-server.ts). PURO: así se
 * prueba qué recibe el modelo sin la base.
 */
import { pieceLabel } from "@/lib/pieces/registry";
import { tipoDeArtefacto, type TipoDeArtefacto } from "./tipos";

/** Los tipos que alimentan a cada uno: los lee con todas sus copias (`loadCanvasContext`). */
export const TIPOS_QUE_LO_ALIMENTAN: Readonly<Record<string, readonly string[]>> = {
  kickoff: [],
  diagnosis: ["exploration"],
  planning: ["diagnosis", "exploration"],
  exploration: ["kickoff"],
  "adoption-plan": ["diagnosis", "planning"],
  integration: ["tech-requirements", "planning"],
};

/** El tope de cada documento que alimenta: con varias copias, el texto crece. */
export const TOPE_DE_CADA_FUENTE = 30_000;

export interface PartesDelMensaje {
  /** Lo que pidió quien genera ESTA corrida (ya rotulado; "" sin pedido). */
  pedido: string;
  /** Las instrucciones guardadas en esta copia (ya rotuladas; "" sin instrucciones). */
  instruccionesDeLaCopia: string;
  tipo: TipoDeArtefacto;
  nombreDeLaCopia: string;
  empresa: string;
  industria: string | null;
  handoff: string;
  reuniones: string;
  avisoSinReuniones: string;
  notas: string;
  memoria: string;
  alimentan: ReadonlyArray<{ tipo: string; texto: string }>;
  cierreDeFrontera: string;
}

export function mensajeDeLaCopia(p: PartesDelMensaje): string {
  const partes: string[] = [];
  if (p.pedido) partes.push(p.pedido.trim());
  if (p.instruccionesDeLaCopia) partes.push(p.instruccionesDeLaCopia.trim());
  partes.push(
    `Empresa: ${p.empresa}\nIndustria: ${p.industria ?? "No especificada"}\n` +
      `Documento: ${p.tipo.nombre} «${p.nombreDeLaCopia}». El nombre dice el foco de este documento: escríbelo para ese foco y no repitas lo que otro documento del proyecto ya cubre.`,
  );
  partes.push(`=== HANDOFF DEL PROYECTO (lo vendido: tu fuente ancla) ===\n${p.handoff.trim() || "(Sin handoff. No inventes alcance: marca con ⚠️ Por validar lo que no esté en las fuentes.)"}`);
  for (const a of p.alimentan) {
    if (!a.texto.trim()) continue;
    const nombre = tipoDeArtefacto(a.tipo)?.nombre ?? pieceLabel(a.tipo);
    partes.push(`=== ${nombre.toUpperCase()} DEL PROYECTO ===\n${a.texto.trim()}`);
  }
  if (p.reuniones.trim()) partes.push(`=== LAS REUNIONES ELEGIDAS POR EL EQUIPO (precisan el alcance; nada de acá agranda lo vendido) ===\n${p.reuniones.trim()}`);
  else if (p.avisoSinReuniones.trim()) partes.push(p.avisoSinReuniones.trim());
  if (p.notas.trim()) partes.push(`=== NOTAS DEL EQUIPO ===\n${p.notas.trim()}`);
  if (p.memoria.trim()) partes.push(`${p.memoria.trim()}\n(Lo de la memoria precisa el contexto; nada de acá agranda el alcance vendido.)`);
  if (p.cierreDeFrontera.trim()) partes.push(p.cierreDeFrontera.trim());
  partes.push(
    `Escribe ${p.tipo.conArticulo} siguiendo tus instrucciones y el esquema de cada sección. Marca con ⚠️ Por validar lo que no esté confirmado en las fuentes; no inventes nombres de propiedades, cifras, fechas ni acuerdos. Si una sección no tiene respaldo, déjala vacía.`,
  );
  return partes.join("\n\n");
}
