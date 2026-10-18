/**
 * lib/flow/grupos-del-riel.ts — LOS DOS GRUPOS DEL RIEL DE UN PROYECTO. PURO.
 *
 * Decisión 11 de docs/nexus-sistema-de-trabajo-plan.md (2026-10-17): el riel de la ficha separa las HERRAMIENTAS DEL
 * PROYECTO (internas, sin plantilla: Resumen, Cronograma, lo que contesta el cliente, Exploración, Handoff, Ejecución) de los
 * ENTREGABLES (los ve el cliente, con plantilla: Kickoff, Diagnóstico, Planificación, Integraciones, Entrega). El grupo
 * sale de `PieceDefinition.clase` del registro de piezas, no de una lista acá.
 *
 * Las herramientas van primero: el Resumen encabeza el riel y el cronograma es la pantalla que más se abre. Adentro de
 * cada grupo se conserva el orden de presentación (lib/flow/orden-de-presentacion.ts). Un canvas suelto del CSE es una
 * herramienta: es interno, nadie se lo entrega al cliente. Agrupar no decide nada del avance: ninguna etapa lo lee.
 *
 * Un servicio recurrente no pasa por acá: su riel lleva el grupo del ciclo («Ciclo · Implementación»), como antes.
 */
import { pieceBySlug, type ClaseDePieza } from "@/lib/pieces/registry";

export interface GrupoDelRiel {
  id: ClaseDePieza;
  titulo: string;
}

export const GRUPO_HERRAMIENTAS: GrupoDelRiel = { id: "herramienta", titulo: "Herramientas del proyecto" };
export const GRUPO_ENTREGABLES: GrupoDelRiel = { id: "entregable", titulo: "Entregables" };

/** El grupo de una fila del riel. Lo que no es un entregable (un canvas suelto, una pieza sin clase) es herramienta. */
export function grupoDelRiel(slug: string): GrupoDelRiel {
  return pieceBySlug(slug)?.clase === "entregable" ? GRUPO_ENTREGABLES : GRUPO_HERRAMIENTAS;
}

/** Las filas con las herramientas primero y los entregables después; estable adentro de cada grupo. */
export function ordenarPorGrupo<T extends { slug: string }>(filas: readonly T[]): T[] {
  const herramientas = filas.filter((f) => grupoDelRiel(f.slug).id === "herramienta");
  const entregables = filas.filter((f) => grupoDelRiel(f.slug).id === "entregable");
  return [...herramientas, ...entregables];
}
