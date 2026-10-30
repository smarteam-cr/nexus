/**
 * lib/artefactos/copias.ts — LAS COPIAS DE UN TIPO, EN MEMORIA (etapa V3 de docs/artefactos-plan.md). PURO.
 *
 * La regla de convivencia cabe en una línea: **el documento de siempre de un tipo tiene `slug`; las copias no lo tienen y
 * llevan `tipoArtefacto`**. Las dos son «una más» (Elías, 29 oct: no hay una oficial): cada una con su nombre (`name`),
 * su orden (`order`) y su estado (`terminadoEn`). Este archivo dice, sin tocar la base, de qué tipo es un documento, cómo
 * se llama en pantalla, en qué estado está y en qué orden van.
 */
import { pieceBySlug, pieceByName } from "@/lib/pieces/registry";
import { tipoDeArtefacto } from "./tipos";

/** Lo mínimo de un canvas para saber de qué tipo es. */
export interface CanvasConTipo {
  slug: string | null;
  tipoArtefacto?: string | null;
  name: string;
  businessCaseId?: string | null;
  /** El nombre que le puso una persona (columna `titulo`); null = el de fábrica. */
  titulo?: string | null;
}

/**
 * EL TIPO de un documento: el `slug` de la de siempre, el `tipoArtefacto` de una copia, o el nombre histórico de una
 * fila vieja sin slug (la lectura doble de lib/pieces/canvas-query.ts). null = un canvas suelto del CSE o de una
 * propuesta.
 *
 * ⛔ Una copia NUNCA se resuelve por su nombre: una copia llamada «Planificación» se leería como la de siempre y el panel
 * le pondría los botones que escriben sobre la otra.
 */
export function tipoDelDocumento(c: CanvasConTipo): string | null {
  if (c.slug) return c.slug;
  if (c.tipoArtefacto) return c.tipoArtefacto;
  if (c.businessCaseId) return null;
  return pieceByName(c.name)?.slug ?? null;
}

/** ¿Es una copia (y no el documento de siempre de su tipo)? */
export function esCopia(c: Pick<CanvasConTipo, "slug" | "tipoArtefacto">): boolean {
  return !c.slug && !!c.tipoArtefacto;
}

export type EstadoDelArtefacto = "en_construccion" | "terminado";

export const ROTULO_DEL_ESTADO: Readonly<Record<EstadoDelArtefacto, string>> = {
  en_construccion: "En construcción",
  terminado: "Terminado",
};

export function estadoDelArtefacto(c: { terminadoEn?: Date | string | null }): EstadoDelArtefacto {
  return c.terminadoEn ? "terminado" : "en_construccion";
}

/**
 * EL NOMBRE EN PANTALLA: el que le puso una persona (`titulo`). Sin él, una copia se ve con su `name` y el documento de
 * siempre con el nombre de su PIEZA, nunca con su `name`: hay filas viejas con un `name` que hoy no se muestra (el riel lee
 * el registro, lib/flow/dropdown-rows.test.ts). Así un proyecto con una sola planificación se ve exactamente igual que antes.
 */
export function nombreDelArtefacto(c: CanvasConTipo): string {
  const propio = c.titulo?.trim();
  if (propio) return propio;
  const tipo = tipoDelDocumento(c);
  if (!tipo || esCopia(c)) return c.name;
  return pieceBySlug(tipo)?.label ?? tipoDeArtefacto(tipo)?.nombre ?? c.name;
}

/** El nombre que escribió la persona, limpio y con tope: el que se guarda en `titulo`. */
export function tituloLimpio(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_NOMBRE);
}

export const TOPE_DEL_NOMBRE = 120;

/**
 * El nombre que se GUARDA en una copia. Recortado y con tope, y nunca uno con el que una pieza se resuelve por nombre
 * (`pieceByName`): esa lectura doble existe para las filas viejas sin slug, y una copia llamada «Kickoff» la confundiría
 * con el kickoff de siempre. A esa se le suma « · copia».
 */
export function nombreGuardableDeUnaCopia(nombre: string): string {
  const n = nombre.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_NOMBRE);
  if (!n) return "";
  return pieceByName(n) ? `${n} · copia`.slice(0, TOPE_DEL_NOMBRE + 8) : n;
}

/** El nombre de una copia nueva cuando nadie escribe uno: «Planificación 2», «Plan de adopción 1»… sin repetir. */
export function nombreParaUnaCopiaNueva(tipo: string, existentes: readonly string[]): string {
  const base = tipoDeArtefacto(tipo)?.nombre ?? tipo;
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  for (let i = existentes.length + 1; i < existentes.length + 50; i++) {
    const n = `${base} ${i}`;
    if (!usados.has(n.toLowerCase())) return nombreGuardableDeUnaCopia(n);
  }
  return nombreGuardableDeUnaCopia(`${base} ${Date.now()}`);
}

/** El orden de los documentos de un tipo: el que eligió la persona (`order`) y, a la par, el más viejo primero. */
export function ordenarArtefactos<T extends { order: number; createdAt: Date | string | number }>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * El RÓTULO con que un agente lee una copia: «Planificación — Marketing (terminado)». Solo cuando el proyecto tiene más de
 * un documento del tipo: con uno solo, el texto que recibe el agente queda byte a byte como antes.
 */
export function rotuloParaLosAgentes(c: CanvasConTipo & { terminadoEn?: Date | string | null }): string {
  const tipo = tipoDelDocumento(c);
  const nombreDelTipo = (tipo && tipoDeArtefacto(tipo)?.nombre) ?? "Documento";
  const nombre = nombreDelArtefacto(c);
  const estado = estadoDelArtefacto(c) === "terminado" ? "terminado" : "en construcción";
  return nombre === nombreDelTipo ? `${nombreDelTipo} (${estado})` : `${nombreDelTipo} — ${nombre} (${estado})`;
}

/** La línea que avisa al agente cómo pesar varias copias. */
export const COMO_LEER_VARIAS_COPIAS =
  "Este proyecto tiene más de un documento de este tipo, cada uno con su nombre. Lo «terminado» ya se acordó; lo «en construcción» es un borrador que todavía cambia: pésalo menos y no lo des por acordado.";
