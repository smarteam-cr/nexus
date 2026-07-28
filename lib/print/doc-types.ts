/**
 * lib/print/doc-types.ts — qué documentos se pueden imprimir, y cómo.
 *
 * PURO y client-safe (sin prisma, sin React): lo importan el botón de descarga, la página
 * de impresión, el endpoint y los guards. Agregar un tipo es agregar una entrada acá.
 *
 * ── QUÉ NO VIVE ACÁ ──────────────────────────────────────────────────────────
 * La `LandingConfig` y el adaptador de cada tipo son módulos de React: viven en
 * `components/print/PrintDocView.tsx`, del lado cliente. Este registro guarda solo lo que
 * se puede serializar, que es justo lo que necesitan el guard y el botón.
 *
 * ── EL CAMINO GENÉRICO NO CUBRE TODO, A PROPÓSITO ────────────────────────────
 * Solo los documentos del MOTOR de landings entran acá. El handoff, la información del
 * cliente, el cronograma, el «Resumen» y los canvas a medida del CSE no tienen definición
 * en el motor y siguen imprimiéndose por `/print/canvas/**`, que es genérico por diseño.
 * Quién va por cuál camino lo decide el botón leyendo `hasPrintDoc(slug)` — un canvas sin
 * pieza cae al fallback por construcción, sin un `if` que haya que mantener.
 */

/** De dónde sale el contenido y, por lo tanto, quién autoriza. */
export type PrintScope = "project-piece" | "business-case" | "role";

export interface PrintDocType {
  /** Identidad en la URL y en `PrintJobToken.docType`. Estable: nunca cambia. */
  id: string;
  /** Pieza de `lib/pieces/registry.ts`. null cuando el documento no es una pieza de proyecto. */
  pieceSlug: string | null;
  scope: PrintScope;
  /** Cómo se nombra en la UI (el botón, los mensajes de error). */
  label: string;
  /**
   * Paleta del motor. "internal" = grises + un solo ámbar, para los documentos que el
   * CLIENTE NO VE. Ojo: no alcanza con envolver — entra por prop a `LandingView`, ver
   * lib/ui/landing-palette-scope.test.ts.
   */
  palette: "brand" | "internal";
  /**
   * ¿Ya imprime por el camino genérico? Un tipo entra al registro cuando se decide que va a
   * migrar, y se prende cuando su cargador existe: así el archivo dice qué falta en vez de
   * esconderlo. Los apagados no resuelven ni en la ruta ni en el botón —caen al camino de
   * siempre— y `lib/print/doc-types.test.ts` cuida que ninguno quede prendido sin adaptador.
   */
  ready: boolean;
}

export const PRINT_DOC_TYPES: PrintDocType[] = [
  {
    id: "business-case",
    pieceSlug: null, // cuelga de BusinessCase, no de un proyecto
    scope: "business-case",
    label: "Caso de negocio",
    palette: "brand",
    ready: true,
  },
  {
    id: "kickoff",
    pieceSlug: "kickoff",
    scope: "project-piece",
    label: "Kickoff",
    palette: "brand", // lo ve el cliente
    ready: true,
  },
  {
    id: "tech-requirements",
    pieceSlug: "tech-requirements",
    scope: "project-piece",
    label: "Requerimiento técnico",
    palette: "brand", // se comparte con el desarrollador y con el cliente
    ready: true,
  },
  {
    id: "diagnosis",
    pieceSlug: "diagnosis",
    scope: "project-piece",
    // Marca A PROPÓSITO aunque hoy no se publique: es de cara al cliente y la vía de
    // entrega es la sesión en vivo y este export (ver el header de DiagnosticoWorkspace).
    label: "Diagnóstico",
    palette: "brand",
    ready: true,
  },
  {
    id: "planning",
    pieceSlug: "planning",
    scope: "project-piece",
    label: "Planificación",
    palette: "internal",
    ready: true,
  },
  {
    id: "implementation",
    pieceSlug: "implementation",
    scope: "project-piece",
    label: "Implementación",
    palette: "internal",
    ready: true,
  },
  {
    id: "exploration",
    pieceSlug: "exploration",
    scope: "project-piece",
    label: "Exploración",
    palette: "internal", // documento INTERNO: no existe superficie externa, por diseño
    ready: true,
  },
  {
    id: "role",
    pieceSlug: null, // vive en RoleProfile.content, no en CanvasBlock
    scope: "role",
    label: "Perfil de puesto",
    palette: "brand",
    ready: true,
  },
];

/* Los índices solo llevan los tipos PRENDIDOS: un tipo a medio migrar no debe resolver ni
   por URL ni por botón. Que la lista completa siga visible arriba es la documentación. */
const LISTOS = PRINT_DOC_TYPES.filter((t) => t.ready);
const POR_ID = new Map(LISTOS.map((t) => [t.id, t]));
const POR_SLUG = new Map(LISTOS.filter((t) => t.pieceSlug).map((t) => [t.pieceSlug!, t]));

/** `null` para un tipo que no existe o no está prendido — el caller responde 404 ANTES de
 *  tocar la base. */
export function printDocType(id: string | null | undefined): PrintDocType | null {
  return id ? (POR_ID.get(id) ?? null) : null;
}

/** ¿Esta pieza tiene PDF propio, o va por el camino genérico? Lo consulta el botón. */
export function printDocForPiece(slug: string | null | undefined): PrintDocType | null {
  return slug ? (POR_SLUG.get(slug) ?? null) : null;
}
