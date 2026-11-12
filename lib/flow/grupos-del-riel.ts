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
import { tipoDeArtefacto } from "@/lib/artefactos/tipos";

export interface GrupoDelRiel {
  id: ClaseDePieza;
  titulo: string;
}

export const GRUPO_HERRAMIENTAS: GrupoDelRiel = { id: "herramienta", titulo: "Herramientas del proyecto" };
export const GRUPO_ENTREGABLES: GrupoDelRiel = { id: "entregable", titulo: "Entregables" };

/**
 * El grupo de una fila del riel. Lo que no es un entregable (un canvas suelto, una pieza sin clase) es herramienta. Un tipo
 * de artefacto sin pieza (el plan de adopción, la integración técnica: lib/artefactos/tipos.ts) va en el grupo de su clase.
 */
export function grupoDelRiel(slug: string): GrupoDelRiel {
  const clase = pieceBySlug(slug)?.clase ?? tipoDeArtefacto(slug)?.clase ?? null;
  return clase === "entregable" ? GRUPO_ENTREGABLES : GRUPO_HERRAMIENTAS;
}

/**
 * Las filas con las herramientas primero y los entregables después. Una COPIA de un tipo (etapa V3) va en el grupo de su
 * tipo (`tipo`), no en el de su slug de fila (`copia:<id>`).
 *
 * Adentro de cada grupo manda el orden que la persona dejó arrastrando (`orden`, `Project.ordenDelRiel`, Elías 12 nov):
 * mezcla tipos. Lo que no está en esa lista (un documento creado después, o un proyecto que nadie ordenó) va al final de
 * su grupo, en el orden de siempre. Sin lista, es el orden de siempre tal cual.
 */
export function ordenarPorGrupo<T extends { slug: string; tipo?: string }>(filas: readonly T[], orden: readonly string[] = []): T[] {
  const grupo = (f: T) => grupoDelRiel(f.tipo ?? f.slug).id;
  const lugar = new Map(orden.map((k, i) => [k, i]));
  const enSuOrden = (lista: T[]) =>
    lista
      .map((f, i) => ({ f, i, l: lugar.get(f.slug) ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.l - b.l || a.i - b.i)
      .map((x) => x.f);
  const herramientas = filas.filter((f) => grupo(f) === "herramienta");
  const entregables = filas.filter((f) => grupo(f) === "entregable");
  return [...enSuOrden(herramientas), ...enSuOrden(entregables)];
}

/**
 * El orden nuevo del proyecto después de arrastrar en un grupo: las claves de ese grupo, en su orden nuevo, y después las
 * que ya estaban (del otro grupo, o desancladas), sin repetir. Arrastrar en «Entregables» no mueve «Herramientas».
 */
export function conOrdenDelGrupo(anterior: readonly string[], delGrupo: readonly string[]): string[] {
  const nuevas = [...new Set(delGrupo)];
  const puestas = new Set(nuevas);
  return [...nuevas, ...anterior.filter((k) => !puestas.has(k))].slice(0, TOPE_DEL_ORDEN);
}

/** Cuántas claves guarda el orden de un proyecto, como mucho. */
export const TOPE_DEL_ORDEN = 300;
