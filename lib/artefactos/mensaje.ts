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

/** ¿La copia tiene foco? Reuniones elegidas CON texto (las que entraron solas no cuentan). La única regla: la usan el mensaje
 * y los resultados del diagnóstico, para que nunca se contradigan (revisión del 12 nov). */
export function tieneFoco(p: { reuniones: string; reunionesSolas?: boolean }): boolean {
  return !!p.reuniones.trim() && !p.reunionesSolas;
}

/**
 * Los resultados medibles del handoff para el diagnóstico (R1, R2…): los objetivos cuantitativos los citan. Son del
 * proyecto ENTERO: en una copia con reuniones elegidas (`foco` = el nombre de la copia) solo entran como objetivo los que
 * tocan ese foco (12 nov: el diagnóstico de marketing de CEMACO salió con «la vista 360», que es de la fase 1). "" sin
 * resultados.
 */
export function bloqueDeResultados(resultados: string, foco: string | null): string {
  if (!resultados.trim()) return "";
  const regla = foco
    ? `Son del proyecto entero y este documento tiene un foco («${foco}», el de las reuniones elegidas): usa como objetivo cuantitativo SOLO los que tocan ese foco; los demás NO van, aunque la guía de los objetivos diga «uno por cada resultado». Si ninguno lo toca, deriva los cuantitativos de las reuniones elegidas y deja \`resultado\` vacío.`
    : "Los objetivos cuantitativos los citan por su código.";
  return `=== RESULTADOS MEDIBLES DEL HANDOFF (R1, R2…) ===\n${regla}\n${resultados.trim()}`;
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
  /** Nadie eligió reuniones y entraron las del proyecto con texto: el rótulo no puede decir que las eligió el equipo. */
  reunionesSolas?: boolean;
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
  /* Las reuniones que eligió el equipo son el FOCO de la copia (Lili y Elías, 12 nov: el diagnóstico de marketing de
     CEMACO sacó sus objetivos del proyecto CRM entero y no de sus tres sesiones de marketing). Van antes del handoff,
     rotuladas como la fuente principal, y el handoff queda como el LÍMITE de lo vendido. Las que entraron solas (nadie
     eligió) siguen detrás del handoff, como antes. */
  const conFoco = tieneFoco(p);
  const sinHandoff = "(Sin handoff. No inventes alcance: marca con ⚠️ Por validar lo que no esté en las fuentes.)";
  /* ⛔ La regla va DELANTE de lo que alimenta y de las reuniones elegidas: la exploración es interna (lo que se supuso, de
     dónde salió cada dato) y sin reuniones ni notas no habría ninguna frontera en el mensaje. */
  if (conFoco || p.alimentan.some((a) => a.texto.trim())) {
    partes.push(`${p.frontera}\nLo que una de estas fuentes marque como supuesto o sin verificar NUNCA se afirma como hecho.`);
  }
  if (conFoco) {
    partes.push(`=== LAS REUNIONES ELEGIDAS POR EL EQUIPO (la fuente PRINCIPAL de este documento: de acá sale su contenido; nada de acá agranda lo vendido) ===\n${p.reuniones.trim()}`);
    partes.push(
      `=== HANDOFF DEL PROYECTO (lo vendido, del proyecto ENTERO: es el LÍMITE de lo que este documento puede prometer, no su contenido; lo que no toque el foco de las reuniones elegidas no va) ===\n${p.handoff.trim() || sinHandoff}`,
    );
  } else {
    partes.push(`=== HANDOFF DEL PROYECTO (lo vendido: tu fuente ancla) ===\n${p.handoff.trim() || sinHandoff}`);
  }
  for (const a of p.alimentan) {
    if (!a.texto.trim()) continue;
    const nombre = tipoDeArtefacto(a.tipo)?.nombre ?? pieceLabel(a.tipo);
    partes.push(`=== ${nombre.toUpperCase()} DEL PROYECTO ===\n${a.texto.trim()}`);
  }
  if (!conFoco && p.reuniones.trim()) partes.push(`=== LAS REUNIONES DEL PROYECTO (precisan el alcance; nada de acá agranda lo vendido) ===\n${p.reuniones.trim()}`);
  else if (!conFoco && p.avisoSinReuniones.trim()) partes.push(p.avisoSinReuniones.trim());
  if (p.notas.trim()) partes.push(`=== NOTAS DEL EQUIPO ===\n${p.notas.trim()}`);
  if (p.memoria.trim()) partes.push(`${p.memoria.trim()}\n(Lo de la memoria precisa el contexto; nada de acá agranda el alcance vendido.)`);
  if (p.cierreDeFrontera.trim()) partes.push(p.cierreDeFrontera.trim());
  partes.push(
    `Escribe ${p.tipo.conArticulo} siguiendo tus instrucciones y el esquema de cada sección.${p.tipo.clientFacing ? " Lo lee el cliente: no le hables al equipo de Smarteam ni nombres al CSE; lo que falte confirmar se dice como pendiente." : ""} Marca con ⚠️ Por validar lo que no esté confirmado en las fuentes; no inventes nombres de propiedades, cifras, fechas ni acuerdos. Si una sección no tiene respaldo, déjala vacía y agrega al JSON la key extra "__vacias": un objeto { key de sección: una frase } que diga qué faltó, en primera persona. La lee solo el equipo, nunca el cliente.`,
  );
  return partes.join("\n\n");
}
