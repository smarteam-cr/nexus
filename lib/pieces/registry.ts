/**
 * lib/pieces/registry.ts
 *
 * REGISTRO DE PIEZAS — la fuente única de qué piezas existen en el flujo de un
 * cliente y qué sabe el sistema de cada una. Módulo PURO (sin Prisma) para que lo
 * puedan importar tanto el servidor como los Client Components.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────
 * Hasta ahora la identidad de una pieza era su NOMBRE VISIBLE (`name: "Desarrollo"`),
 * repetido en 8+ lugares: el mapa agente→canvas, el renderer propio, la celda de
 * permiso del artifact-gate, la vista externa, el contexto que se le pasa a los
 * agentes y hasta un filtro `name: { not: "Handoff" }`. Consecuencia: renombrar una
 * pieza rompía a la vez el ruteo, el render, los permisos y la vista del cliente, y
 * dejaba huérfanos los canvases ya creados en la base.
 *
 * Acá se separan las dos cosas que estaban pegadas:
 *   · `slug`  — IDENTIDAD. En inglés, estable, NUNCA cambia. Es lo que persiste en
 *               `ProjectCanvas.slug` y lo que usa todo lookup del código.
 *   · `label` — NOMBRE VISIBLE. En español, se cambia libremente sin consecuencias.
 *
 * ── Invariante ────────────────────────────────────────────────────────────────
 * `legacyNames` lista TODOS los nombres con los que la pieza existió en la base.
 * Es lo que permite resolver los canvases viejos y hacer el backfill. Cuando se
 * renombre una pieza, el nombre anterior se AGREGA acá — nunca se reemplaza —, o
 * los canvases ya creados dejan de resolver.
 */

/** Alcance de la pieza: de qué cuelga la fila en la base. */
export type PieceScope =
  /** Cuelga de un Project normal (el caso común). */
  | "project"
  /** Cuelga del Project sentinel `__strategy__` del cliente (Información del cliente/Procesos). */
  | "client"
  /** Cuelga de un BusinessCase; ahí `ProjectCanvas.name` es la VERSIÓN, no la pieza. */
  | "business-case";

export interface PieceDefinition {
  /** IDENTIDAD estable. Inglés, minúsculas, kebab-case. Nunca cambia. */
  slug: string;
  /** Nombre visible HOY. Cambiarlo es seguro: no lo usa ningún lookup. */
  label: string;
  /**
   * Todos los nombres con los que esta pieza vive o vivió en `ProjectCanvas.name`.
   * El primero es el canónico actual. Al renombrar se AGREGA el nuevo al frente y
   * el viejo se conserva — es lo que hace resolver a los canvases ya creados.
   */
  legacyNames: string[];
  scope: PieceScope;
  /** `Agent.agentGroup` que escribe en esta pieza. null = no la escribe un agente. */
  agentGroup: string | null;
  /**
   * Sección del mapa de permisos que gobierna generar/regenerar esta pieza
   * (lib/auth/permissions/artifact-gate.ts). null = sin gate propio.
   */
  permissionSection: string | null;
  /** Se pre-crea con el proyecto (hoy: `createDefaultCanvases`). */
  createdWithProject: boolean;
  /** `ProjectCanvas.isDefault` — el canvas ancla, no borrable desde la UI. */
  isDefaultCanvas: boolean;
  /**
   * La pieza NO aplica a todo proyecto. Hoy solo Desarrollo, y su condición vive
   * hardcodeada en un `if` dentro de analyze; en F2 pasa a leerse de acá.
   */
  optional: boolean;
  /**
   * Tags que ENCIENDEN una pieza opcional. Vacío = la enciende una persona a mano.
   * (F2 la evalúa también cuando el CSE cambia los tags — hoy solo se mira una vez,
   * durante el handoff, y por eso un tag agregado después no hace nada.)
   */
  enabledByTags: string[];
  /** Tiene componente propio en vez del renderer genérico de secciones. */
  ownRenderer: boolean;
  /** El cliente puede verla publicada (vista externa por token). */
  clientFacing: boolean;
}

/**
 * ⚠ Los `label` de acá son EXACTAMENTE los nombres vivos hoy en la base. F1 es un
 * refactor SIN cambio visible: solo cambia el mecanismo de identidad. El renombre
 * ("Desarrollo" → "Requerimientos técnicos", "Business Case" → "Propuestas
 * comerciales") llega en F4 y se hace acá, en una línea.
 */
export const PIECES: PieceDefinition[] = [
  {
    slug: "handoff",
    label: "Handoff",
    legacyNames: ["Handoff"],
    scope: "project",
    agentGroup: "handoff",
    permissionSection: "handoff",
    createdWithProject: false, // lo monta el flujo de handoff (createHandoffCanvas)
    isDefaultCanvas: false,
    optional: false, // es la base del proyecto: sin handoff el resto queda mudo
    enabledByTags: [],
    ownRenderer: false,
    clientFacing: false,
  },
  {
    slug: "kickoff",
    label: "Kickoff",
    legacyNames: ["Kickoff"],
    scope: "project",
    agentGroup: "kickoff",
    permissionSection: "kickoff",
    createdWithProject: true,
    isDefaultCanvas: true,
    // Negocio 2026-07-24: el kickoff es un paso NO requerido. Hoy igual se pre-crea
    // (`createdWithProject`); F2 le da el interruptor real.
    optional: true,
    enabledByTags: [],
    ownRenderer: false,
    clientFacing: true,
  },
  {
    slug: "timeline",
    label: "Cronograma",
    legacyNames: ["Cronograma"],
    scope: "project",
    agentGroup: "cronograma",
    permissionSection: "cronograma",
    createdWithProject: true,
    isDefaultCanvas: false,
    optional: false,
    enabledByTags: [],
    // El contenido NO vive en bloques sino en ProjectTimeline → renderer propio.
    ownRenderer: true,
    clientFacing: true,
  },
  {
    slug: "exploration",
    label: "Exploración",
    legacyNames: ["Exploración"],
    scope: "project",
    agentGroup: "exploracion",
    permissionSection: "exploracion",
    createdWithProject: true,
    isDefaultCanvas: false,
    optional: true,
    enabledByTags: [],
    ownRenderer: false,
    clientFacing: false, // documento INTERNO de descubrimiento
  },
  {
    slug: "diagnosis",
    label: "Diagnóstico",
    legacyNames: ["Diagnóstico"],
    scope: "project",
    agentGroup: "diagnostico",
    // Hoy NO tiene celda propia y cae al default null (cualquiera que corra agentes
    // genera diagnósticos). Se deja explícito para no perder el hallazgo.
    permissionSection: null,
    createdWithProject: true,
    isDefaultCanvas: false,
    optional: true,
    enabledByTags: [],
    ownRenderer: false,
    clientFacing: false,
  },
  {
    slug: "planning",
    label: "Planificación",
    legacyNames: ["Planificación"],
    scope: "project",
    agentGroup: "planificacion",
    // Herencia: se gatea con la celda `cronograma` de cuando escribía el esqueleto
    // del timeline. Su prompt actual ya no emite fechas. Anotado, no cambiado en F1.
    permissionSection: "cronograma",
    createdWithProject: true,
    isDefaultCanvas: false,
    optional: true,
    enabledByTags: [],
    ownRenderer: false,
    clientFacing: false,
  },
  {
    slug: "tech-requirements",
    label: "Desarrollo", // F4: → "Requerimientos técnicos"
    legacyNames: ["Desarrollo"],
    scope: "project",
    agentGroup: "desarrollo",
    permissionSection: "desarrollo",
    createdWithProject: false, // ON-DEMAND: lo monta createDesarrolloCanvas
    isDefaultCanvas: false,
    optional: true,
    // hasTechnicalScope(tags) — hoy hardcodeado en analyze/route.ts.
    enabledByTags: ["custom_dev", "insider_one"],
    ownRenderer: true, // DesarrolloWorkspace
    clientFacing: true, // vista del dev externo
  },
  {
    slug: "client-info",
    label: "Información del cliente",
    legacyNames: ["Información del cliente"],
    // Vive en el Project sentinel `__strategy__`: es del CLIENTE, no del proyecto.
    // Decisión 2026-07-24: se queda así (dos proyectos comparten los procesos).
    scope: "client",
    agentGroup: null, // lo escribe agent-mapeo-inicial vía sync-procesos-blocks
    permissionSection: "procesos",
    createdWithProject: false,
    isDefaultCanvas: false,
    optional: false,
    enabledByTags: [],
    ownRenderer: true,
    clientFacing: false,
  },
  {
    slug: "business-case",
    label: "Business Case", // F4: → "Propuesta comercial"
    // ⚠ Para esta pieza `ProjectCanvas.name` NO es la pieza sino la VERSIÓN
    // ("Plantilla", "Propuesta 1", "Caso de uso 2"). Por eso el backfill de slug
    // NO puede ir por nombre: se resuelve por `businessCaseId != null`.
    legacyNames: [],
    scope: "business-case",
    agentGroup: "businesscase",
    permissionSection: "ventas",
    createdWithProject: false,
    isDefaultCanvas: false,
    optional: false,
    enabledByTags: [],
    ownRenderer: true, // motor de landings
    clientFacing: true,
  },
];

// ── Índices ────────────────────────────────────────────────────────────────────

const BY_SLUG = new Map(PIECES.map((p) => [p.slug, p]));

/** name (incluidos los legacy) → pieza. Case-sensitive: así están en la base. */
const BY_NAME = new Map<string, PieceDefinition>();
for (const p of PIECES) for (const n of p.legacyNames) BY_NAME.set(n, p);

const BY_AGENT_GROUP = new Map(
  PIECES.filter((p) => p.agentGroup).map((p) => [p.agentGroup as string, p]),
);

export function pieceBySlug(slug: string): PieceDefinition | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * Resuelve una pieza desde un nombre de canvas — el puente con los datos viejos.
 * Devuelve null para los canvases de Business Case (su `name` es la versión): esos
 * se resuelven por `businessCaseId`, ver `pieceForCanvas`.
 */
export function pieceByName(name: string): PieceDefinition | null {
  return BY_NAME.get(name) ?? null;
}

export function pieceByAgentGroup(group: string): PieceDefinition | null {
  return BY_AGENT_GROUP.get(group) ?? null;
}

/**
 * Resolución CANÓNICA de un canvas a su pieza, con la regla de precedencia:
 *   1. `slug` si ya está poblado (post-migración).
 *   2. `businessCaseId` presente → es del Business Case, sin mirar el nombre.
 *   3. el nombre, para los canvases anteriores al backfill.
 * Devolver null significa "canvas suelto/custom", no es un error.
 */
export function pieceForCanvas(canvas: {
  slug?: string | null;
  name: string;
  businessCaseId?: string | null;
}): PieceDefinition | null {
  if (canvas.slug) return pieceBySlug(canvas.slug);
  if (canvas.businessCaseId) return pieceBySlug("business-case");
  return pieceByName(canvas.name);
}

/** El slug que le corresponde a un canvas — lo usa el backfill de la migración. */
export function slugForCanvas(canvas: {
  name: string;
  businessCaseId?: string | null;
}): string | null {
  return pieceForCanvas(canvas)?.slug ?? null;
}

/** Nombre visible de una pieza; el slug crudo si no está registrada. */
export function pieceLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

/** Piezas que se pre-crean con un proyecto nuevo (reemplaza la lista fija del seed). */
export function piecesCreatedWithProject(): PieceDefinition[] {
  return PIECES.filter((p) => p.scope === "project" && p.createdWithProject);
}

/**
 * Piezas opcionales que ENCIENDEN estos tags. Base de F2: hoy la única regla
 * (`hasTechnicalScope`) vive en un `if` dentro de analyze y solo se evalúa durante
 * el handoff — por eso un tag agregado después no activa nada.
 */
export function piecesEnabledByTags(tags: string[]): PieceDefinition[] {
  const set = new Set(tags);
  return PIECES.filter((p) => p.optional && p.enabledByTags.some((t) => set.has(t)));
}
