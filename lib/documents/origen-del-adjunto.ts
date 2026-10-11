/**
 * lib/documents/origen-del-adjunto.ts — desde qué «Contexto adicional» se subió un documento de la
 * empresa (`ClientDocument.origen`, 2026-10-07).
 *
 * Pedido de Elías: «asegurar que los archivos adjuntos queden en la información del cliente, en
 * documentos. Todo a nivel de empresa, si se agregan desde una preventa o desde un proyecto». Un archivo
 * subido en el contexto de una pieza se guarda dos veces, con dos dueños distintos:
 *   · su TEXTO, como fuente de esa pieza (la nota del cronograma, el documento de la preventa…), que es
 *     lo que lee su agente;
 *   · el ARCHIVO, como documento de la empresa, para que esté en Documentos.
 *
 * Por eso un documento con origen NO entra al contexto general de los agentes (`/analyze` lo filtra con
 * `SIN_ORIGEN_DE_CONTEXTO`): ya entra por su pieza, y leerlo dos veces lo haría pesar doble. Además una
 * minuta de la preventa puede traer precios: en el contexto general llegaría al kickoff, que lo ve el
 * cliente.
 *
 * Módulo PURO (lo usan la pantalla de Documentos y las rutas).
 */
import { DOCUMENTOS_CON_CONTEXTO } from "@/lib/contexto/documento";

const FIJOS = {
  preventa: "la preventa",
  propuesta: "la propuesta comercial",
  handoff: "el handoff",
  cronograma: "el cronograma",
  exploracion: "la exploración",
} as const;

/** Todos los orígenes válidos: los fijos más la pieza de cada documento con contexto. */
const NOMBRES: ReadonlyMap<string, string> = new Map<string, string>([
  ...Object.entries(FIJOS),
  ...DOCUMENTOS_CON_CONTEXTO.map((d) => [d.pieza, d.elDocumento] as const),
]);

export function esOrigenDelAdjunto(v: unknown): v is string {
  return typeof v === "string" && NOMBRES.has(v);
}

/** «Subido en el contexto del cronograma». null sin origen (subido en Documentos). */
export function dondeSeSubio(origen: string | null | undefined): string | null {
  if (!origen) return null;
  const nombre = NOMBRES.get(origen);
  if (!nombre) return null;
  // «de el cronograma» → «del cronograma».
  return `Subido en el contexto ${nombre.startsWith("el ") ? `del ${nombre.slice(3)}` : `de ${nombre}`}`;
}

/** El filtro de Prisma para el contexto general de los agentes: solo lo subido en Documentos. */
export const SIN_ORIGEN_DE_CONTEXTO = { origen: null } as const;
