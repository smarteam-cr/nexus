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
  implementation: ["planning", "tech-requirements"],
  questionnaires: [],
  "adoption-plan": ["diagnosis", "planning"],
  roadmap: ["diagnosis", "planning"],
  "tech-requirements": ["planning"],
  delivery: ["diagnosis", "planning"],
};

/** El tope de cada documento que alimenta: con varias copias, el texto crece. */
export const TOPE_DE_CADA_FUENTE = 30_000;

/**
 * Una fuente con su tope. Se corta en un límite de sección y lo DICE: sin el aviso, el modelo toma lo que falta como que no
 * existe. Las copias en construcción van al final (lib/artefactos/lectores.ts), así que son las primeras en quedar afuera.
 */
export function fuenteConTope(texto: string, tope = TOPE_DE_CADA_FUENTE): string {
  if (texto.length <= tope) return texto;
  const corte = texto.lastIndexOf("[Sección: ", tope);
  const hasta = corte > tope / 2 ? corte : tope;
  return `${texto.slice(0, hasta).trimEnd()}\n\n(Esta fuente sigue y se recortó por largo: no concluyas que algo no existe por no verlo acá.)`;
}

export interface PartesDelMensaje {
  /** Lo que pidió quien genera ESTA corrida (ya rotulado; "" sin pedido). */
  pedido: string;
  /** Las instrucciones guardadas en esta copia (ya rotuladas; "" sin instrucciones). */
  instruccionesDeLaCopia: string;
  tipo: TipoDeArtefacto;
  nombreDeLaCopia: string;
  empresa: string;
  industria: string | null;
  /** Lo vendido según las etiquetas del proyecto (los hubs y el alcance); "" sin etiquetas. */
  alcanceEtiquetado: string;
  /** El servicio recurrente contratado, en una línea; "" si es un proyecto. */
  servicio: string;
  /** Lo propio del tipo que lee el documento de siempre: el bloque del servicio y la escala del kickoff. "" sin eso. */
  delTipo: string;
  /** La regla de lo que puede pasar al documento (`fronteraDeLaPieza`): va delante de los documentos que lo alimentan. */
  frontera: string;
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
      (p.servicio ? `Servicio contratado: ${p.servicio} (servicio recurrente)\n` : "") +
      (p.alcanceEtiquetado ? `Alcance etiquetado (tags del proyecto): ${p.alcanceEtiquetado}\n` : "") +
      `Documento: ${p.tipo.nombre} «${p.nombreDeLaCopia}». El nombre dice el foco de este documento: escríbelo para ese foco y no repitas lo que otro documento del proyecto ya cubre.`,
  );
  if (p.delTipo.trim()) partes.push(p.delTipo.trim());
  partes.push(`=== HANDOFF DEL PROYECTO (lo vendido: tu fuente ancla) ===\n${p.handoff.trim() || "(Sin handoff. No inventes alcance: marca con ⚠️ Por validar lo que no esté en las fuentes.)"}`);
  /* ⛔ La regla va DELANTE de lo que alimenta: la exploración es interna (lo que se supuso, de dónde salió cada dato) y sin
     reuniones ni notas no habría ninguna frontera en el mensaje. */
  if (p.alimentan.some((a) => a.texto.trim())) {
    partes.push(`${p.frontera}\nLo que una de estas fuentes marque como supuesto o sin verificar NUNCA se afirma como hecho.`);
  }
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
