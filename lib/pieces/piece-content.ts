/**
 * lib/pieces/piece-content.ts — ¿esta pieza tiene contenido DE VERDAD? SERVER-ONLY.
 *
 * Es la señal que pinta el punto del desplegable (verde "Generada" vs ámbar "Todavía
 * sin contenido"), que elige el CTA ("Regenerar" vs "Generar") y que alimenta
 * `pieceReadiness` para avisar "Antes: Exploración". Vive acá, en UN solo lugar, porque
 * la calculan DOS caminos —el listado `/api/projects/[id]/canvases` y el seed
 * server-side de la página del cliente— y tenerla escrita dos veces es exactamente
 * cómo nace el próximo desfase entre el primer pintado y el refetch.
 *
 * ── La trampa del bloque SEMILLA ──────────────────────────────────────────────
 * "Tiene algún CanvasBlock" NO sirve como criterio. Al crear una pieza,
 * `createDefaultCanvases` / `createOnDemandCanvas` SIEMBRAN un CARD `source: HUMAN`
 * en cada sección CURADA (la que trae `defaultData` en canvas-defs: el `cierre` de
 * kickoff/diagnóstico/planificación/exploración/desarrollo/implementación, más
 * equipo/horarios/canales del Kickoff). Sin ese bloque el editor no persiste y el
 * agente no las genera — o sea que la semilla es estructura, no contenido. Contarla
 * daba VERDE + "Regenerar" en piezas recién creadas y vacías, y como Exploración nace
 * con el proyecto, el aviso "Antes: Exploración" no se mostraba NUNCA.
 *
 * El criterio honesto, entonces, cuenta un bloque cuando:
 *   · está en una sección NO curada (ahí no hay semilla: si hay algo, lo escribió el
 *     agente o el CSE a mano — las dos cosas son contenido real), o
 *   · su `source` no es HUMAN (AGENT = lo generó la IA; MODIFIED = lo generó y lo
 *     editaron), que es la misma señal que usa el gate de permisos
 *     (lib/auth/permissions/artifact-gate.ts) para decidir generate vs regenerate.
 *
 * ── La excepción: el Cronograma ───────────────────────────────────────────────
 * La pieza `timeline` tiene `sections: []` porque su contenido NO vive en
 * CanvasSection/CanvasBlock sino en `ProjectTimeline` (fases → semanas → tareas). Con
 * el criterio de bloques daba "vacía" en el 100% de los proyectos, incluso con el
 * cronograma lleno y publicado. Se resuelve mirando dónde vive de verdad: tiene
 * contenido si el timeline del proyecto tiene al menos una FASE (el mismo umbral que
 * `deriveSetup` usa para llamarlo "borrador" en lib/portfolio/project-setup.ts).
 */
import { prisma } from "@/lib/db/prisma";
import { CANVAS_DEF_BY_SLUG } from "@/lib/canvas/canvas-defs";

/** SLUG de la pieza cuyo contenido no vive en bloques (ver cabecera). */
export const TIMELINE_PIECE_SLUG = "timeline";

/**
 * Keys de las secciones que la creación de la pieza SIEMBRA con un bloque (las que
 * traen `defaultData`). Un bloque ahí no prueba nada por sí solo.
 */
export function seededSectionKeys(slug: string | null): Set<string> {
  const def = slug ? CANVAS_DEF_BY_SLUG[slug] : null;
  if (!def) return new Set(); // custom del CSE: no hay semilla, todo lo que haya es suyo
  return new Set(def.sections.filter((s) => s.defaultData).map((s) => s.key));
}

/** Lo mínimo que hace falta saber de un canvas para juzgar su contenido. */
export interface CanvasParaContenido {
  id: string;
  slug: string | null;
}

export interface ContenidoInput {
  canvases: CanvasParaContenido[];
  /** Una entrada por SECCIÓN que tenga al menos un bloque (cualquiera). */
  seccionesConBloques: Array<{ canvasId: string; key: string }>;
  /** Ids de canvas con al menos un bloque `source != HUMAN` (generado por IA). */
  canvasesConBloqueGenerado: string[];
  /** ¿El ProjectTimeline del proyecto tiene fases? (la excepción del Cronograma). */
  timelineTieneFases: boolean;
}

/** Núcleo PURO del criterio: qué canvases tienen contenido real. */
export function deriveCanvasesConContenido(input: ContenidoInput): Set<string> {
  const semillaPorCanvas = new Map(
    input.canvases.map((c) => [c.id, seededSectionKeys(c.slug)]),
  );

  // Puerta 1: hay un bloque generado por IA en el canvas.
  const conContenido = new Set(input.canvasesConBloqueGenerado);
  // Puerta 2: hay un bloque en una sección que NO se siembra al crear la pieza.
  for (const s of input.seccionesConBloques) {
    if (conContenido.has(s.canvasId)) continue;
    if (!semillaPorCanvas.get(s.canvasId)?.has(s.key)) conContenido.add(s.canvasId);
  }

  if (input.timelineTieneFases) {
    const timeline = input.canvases.find((c) => c.slug === TIMELINE_PIECE_SLUG);
    if (timeline) conContenido.add(timeline.id);
  }

  return conContenido;
}

/**
 * Carga la señal para los canvases de un proyecto. Consultas AGRUPADAS (no N+1):
 * interesa la EXISTENCIA de contenido, no cuánto hay.
 */
export async function loadCanvasesConContenido(
  projectId: string,
  canvases: CanvasParaContenido[],
): Promise<Set<string>> {
  const ids = canvases.map((c) => c.id);
  const tieneTimeline = canvases.some((c) => c.slug === TIMELINE_PIECE_SLUG);
  if (!ids.length) return new Set();

  const [seccionesConBloques, canvasesConBloqueGenerado, tl] = await Promise.all([
    prisma.canvasSection.findMany({
      where: { canvasId: { in: ids }, blocks: { some: {} } },
      select: { canvasId: true, key: true },
    }),
    prisma.canvasSection.findMany({
      where: { canvasId: { in: ids }, blocks: { some: { source: { not: "HUMAN" } } } },
      select: { canvasId: true },
      distinct: ["canvasId"],
    }),
    // Solo si la pieza está en la lista: sin Cronograma en el desplegable, esta consulta
    // sería puro peso.
    tieneTimeline
      ? prisma.projectTimeline.findUnique({
          where: { projectId },
          select: { phases: { take: 1, select: { id: true } } },
        })
      : null,
  ]);

  return deriveCanvasesConContenido({
    canvases,
    seccionesConBloques,
    canvasesConBloqueGenerado: canvasesConBloqueGenerado.map((s) => s.canvasId),
    timelineTieneFases: (tl?.phases.length ?? 0) > 0,
  });
}
