/**
 * lib/auth/permissions/registry.ts — REGISTRY de secciones × acciones. CLIENT-SAFE.
 *
 * Fuente ÚNICA de qué secciones y acciones existen en el sistema de permisos
 * (patrón TAG_CATALOG). Agregar un módulo nuevo (finanzas, pagos, …) = 1 entrada
 * acá → aparece solo en el modal de permisos de /team y el engine lo respeta.
 *
 * `enforced: false` = la acción está declarada pero ningún guard la consulta
 * TODAVÍA → el modal la oculta (nunca un switch mentiroso). Se flipea cuando el
 * enforcement real queda cableado (F5: generate/regenerate de IA; F6: sidebar,
 * áreas de lectura, deudas).
 *
 * Fuera a propósito:
 *   - Sesiones (universal para todo interno — no hay nada que gatear).
 *   - Customer Success: cabalga sobre `clientes.viewAll` vía compat — si algún
 *     día se separa, es 1 entrada nueva acá.
 *   - El row-level (QUÉ clientes ve alguien) vive en lib/auth/access.ts.
 */
import type { ActionDef, PermissionMap, SectionDef } from "./types";

// Labels de acciones repetidas (generación de artefactos con IA). enforced:true
// desde PERM-F5: las gatean resolveArtifactGate (analyze) y timeline/assist.
// OJO: `as const satisfies` (no anotación directa) para que `key` quede como
// literal — la anotación ensancharía a string y rompería ActionKeyOf/PermissionCell.
const GENERATE = { key: "generate", label: "Generar con IA (primera vez)", enforced: true } as const satisfies ActionDef;
const REGENERATE = { key: "regenerate", label: "Regenerar con IA", enforced: true } as const satisfies ActionDef;

export const PERMISSION_SECTIONS = [
  {
    key: "clientes",
    label: "Clientes",
    actions: [
      { key: "viewAll", label: "Ver todos los clientes", enforced: true },
      { key: "share", label: "Compartir clientes", enforced: true },
      { key: "delete", label: "Eliminar clientes", enforced: true },
    ],
  },
  {
    key: "handoff",
    label: "Handoff",
    actions: [
      { key: "create", label: "Crear handoff", enforced: true },
      { key: "write", label: "Editar handoff", enforced: true },
      GENERATE,
      REGENERATE,
    ],
  },
  {
    key: "kickoff",
    label: "Kickoff",
    actions: [GENERATE, REGENERATE],
  },
  {
    key: "procesos",
    label: "Procesos",
    actions: [
      GENERATE,
      REGENERATE,
      { key: "manage", label: "Administrar implementaciones", enforced: true },
    ],
  },
  {
    key: "cronograma",
    label: "Cronograma",
    actions: [
      { key: "write", label: "Editar (tareas, fases, fechas)", enforced: true },
      { key: "delete", label: "Borrar tareas y fases", enforced: true },
      GENERATE,
      { key: "regenerate", label: "Regenerar con IA", enforced: true },
    ],
  },
  {
    key: "ventas",
    label: "Ventas / Business Cases",
    actions: [
      { key: "read", label: "Acceder al área", enforced: true },
      { key: "write", label: "Editar", enforced: false },
    ],
  },
  {
    key: "marketing",
    label: "Marketing y Contenido",
    actions: [
      { key: "read", label: "Acceder al área", enforced: false },
      { key: "write", label: "Editar (insumos, ingesta, aprobar)", enforced: true },
    ],
  },
  {
    key: "cobranza",
    label: "Cobranza",
    actions: [
      { key: "read", label: "Acceder al módulo", enforced: true },
      { key: "write", label: "Editar", enforced: false },
    ],
  },
  {
    key: "conocimientos",
    label: "Conocimientos",
    actions: [{ key: "write", label: "Editar documentos", enforced: true }],
  },
  {
    key: "equipo",
    label: "Equipo",
    actions: [{ key: "manage", label: "Gestionar equipo y permisos", enforced: true }],
  },
  {
    key: "agentes",
    label: "Agentes",
    actions: [
      { key: "read", label: "Ver catálogo", enforced: true },
      { key: "manage", label: "Administrar agentes", enforced: true },
    ],
  },
  {
    key: "auditoria",
    label: "Auditoría",
    actions: [
      { key: "read", label: "Ver auditorías", enforced: true },
      { key: "delete", label: "Eliminar registros", enforced: true },
    ],
  },
  {
    key: "configuracion",
    label: "Configuración",
    actions: [
      { key: "read", label: "Acceder", enforced: true },
      { key: "manage", label: "Administrar configuración", enforced: true },
    ],
  },
] as const satisfies readonly SectionDef[];

/** Claves de sección válidas (derivadas del registry — compile-time). */
export type SectionKey = (typeof PERMISSION_SECTIONS)[number]["key"];

/** Claves de acción válidas PARA una sección dada (compile-time). */
export type ActionKeyOf<S extends SectionKey> = Extract<
  (typeof PERMISSION_SECTIONS)[number],
  { key: S }
>["actions"][number]["key"];

/** Una celda válida de la matriz — par sección/acción correlacionado. */
export type PermissionCell = {
  [S in SectionKey]: { section: S; action: ActionKeyOf<S> };
}[SectionKey];

const SECTION_BY_KEY = new Map(PERMISSION_SECTIONS.map((s) => [s.key as string, s]));

/** Def de la sección, o undefined si la clave no existe en el registry. */
export function sectionByKey(key: string): SectionDef | undefined {
  return SECTION_BY_KEY.get(key);
}

/** ¿La celda sección/acción existe en el registry? (para validación runtime) */
export function isKnownCell(section: string, action: string): boolean {
  return !!SECTION_BY_KEY.get(section)?.actions.some((a) => a.key === action);
}

/** Mapa COMPLETO con toda celda del registry en el valor dado. */
export function uniformMap(value: boolean): PermissionMap {
  const sections: PermissionMap["sections"] = {};
  for (const s of PERMISSION_SECTIONS) {
    sections[s.key] = {};
    for (const a of s.actions) sections[s.key][a.key] = value;
  }
  return { v: 1, sections };
}

/** Mapa all-true — lo que ve un SUPER_ADMIN (hardcodeado, anti-lockout). */
export function allTrueMap(): PermissionMap {
  return uniformMap(true);
}
