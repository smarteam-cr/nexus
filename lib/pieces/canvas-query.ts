/**
 * lib/pieces/canvas-query.ts
 *
 * Cómo se BUSCA un canvas por su pieza. Un solo lugar, para que el resto del código
 * no vuelva a escribir `name: "Kickoff"` a mano.
 *
 * ── Lectura DOBLE, a propósito ────────────────────────────────────────────────
 * Se busca por `slug` O por los nombres históricos de la pieza. El slug ya está
 * backfilleado en los 790 canvases vivos y los puntos de creación ya lo escriben,
 * así que en régimen normal alcanza con el slug. El respaldo por nombre cubre dos
 * casos reales:
 *   · la ventana entre aplicar la migración y deployar este código, donde un canvas
 *     nuevo pudo nacer sin slug;
 *   · cualquier fila que un script viejo cree sin pasar por el registro.
 * El respaldo exige `slug: null` para no colisionar tras un renombre: si una pieza
 * pasa a llamarse como se llamaba otra, la de slug puesto ya no se confunde.
 *
 * El día que `slug` sea NOT NULL, el respaldo se borra y esto queda en una línea.
 */
import type { Prisma } from "@prisma/client";
import { pieceBySlug } from "./registry";

/**
 * Fragmento `where` para encontrar EL canvas de una pieza. Combinalo con el ámbito
 * que corresponda (`projectId`, `clientId`…):
 *
 *   prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") } })
 */
export function canvasOf(slug: string): Prisma.ProjectCanvasWhereInput {
  const legacy = pieceBySlug(slug)?.legacyNames ?? [];
  if (legacy.length === 0) return { slug };
  return { OR: [{ slug }, { slug: null, name: { in: legacy } }] };
}

/**
 * Igual que `canvasOf`, pero para filtrar por el canvas ANIDADO desde una sección o
 * un bloque:
 *
 *   prisma.canvasBlock.count({ where: { section: { canvas: canvasOfNested("kickoff", { projectId }) } } })
 */
export function canvasOfNested(
  slug: string,
  scope: Prisma.ProjectCanvasWhereInput = {},
): Prisma.ProjectCanvasWhereInput {
  return { ...scope, ...canvasOf(slug) };
}

/**
 * Fragmento para EXCLUIR una pieza de un listado. Lo usa el dropdown de canvases del
 * proyecto, que oculta el Handoff a propósito (es entidad cliente-level).
 * `NOT` sobre el OR cubre las dos formas de identificarlo — antes esto era un
 * `name: { not: "Handoff" }` que un renombre dejaba mudo, y el Handoff aparecía en
 * el dropdown sin que nadie lo pidiera.
 */
export function canvasNotOf(slug: string): Prisma.ProjectCanvasWhereInput {
  return { NOT: canvasOf(slug) };
}

/**
 * Fragmento para buscar CUALQUIERA de varias piezas a la vez (batch de un listado).
 * Lo usa el panel de setup, que cuenta bloques de Handoff y Kickoff en una sola query.
 */
export function canvasOfAny(slugs: readonly string[]): Prisma.ProjectCanvasWhereInput {
  return { OR: slugs.map((s) => canvasOf(s)) };
}

/** Igual que `canvasOfAny`, combinado con un ámbito (`projectId`, `clientId`…). */
export function canvasOfAnyNested(
  slugs: readonly string[],
  scope: Prisma.ProjectCanvasWhereInput = {},
): Prisma.ProjectCanvasWhereInput {
  return { ...scope, ...canvasOfAny(slugs) };
}

/**
 * ── VISIBILIDAD, no existencia ────────────────────────────────────────────────
 * Fragmento para las consultas de LISTADO: qué piezas se le muestran al CSE.
 * Se COMBINA por spread para que quede visible en cada punto de uso:
 *
 *   where: { projectId, ...canvasNotOf("handoff"), ...onlyEnabled }
 *
 * ⛔ NUNCA se mete adentro de `canvasOf` / `canvasOfNested` / `canvasOfAny`. Esas son
 * consultas de EXISTENCIA y las usan los cinco find-or-CREATE (`ensureDesarrolloCanvas`,
 * `ensureExploracionCanvas`, `ensureDiagnosticoCanvas`, `ensurePlanificacionCanvas`,
 * `ensureImplementacionCanvas`): si no vieran la pieza apagada crearían un canvas
 * DUPLICADO y dejarían huérfano el contenido viejo — además de chocar contra el índice
 * único parcial (projectId, slug). El mismo razonamiento vale para el gate de permisos
 * (una pieza apagada leída como inexistente convertiría un "regenerar" en "generar" y
 * saltearía la celda que protege pisar contenido) y para el contexto de los agentes.
 *
 * Hay un guard que lo verifica: lib/pieces/enabled-filter.test.ts.
 *
 * ── QUÉ NO HACE APAGAR UNA PIEZA (leer antes de construir el interruptor) ─────
 * Hoy NADA en la app escribe `disabledAt`: `lib/pieces/ensure-canvas.ts` solo lo LIMPIA
 * (reencender). O sea que el apagado existe como dato y como filtro, pero todavía no
 * como acción — y quien la construya tiene que decidir dos cosas que este campo por sí
 * solo NO resuelve:
 *
 *   1. **No despublica.** El requerimiento técnico que lee el desarrollador externo se
 *      gatea con `Project.desarrolloPublishedAt` (lib/external/desarrollo-view.ts), no
 *      con el estado de la pieza. Apagarla la saca del listado interno y el de afuera
 *      sigue viéndola en vivo. Si el interruptor no limpia también ese sello, la
 *      pantalla va a decir "compartido" sobre una pieza que el equipo dio de baja.
 *   2. **No detiene a los agentes.** Los find-or-create de arriba escriben igual sobre
 *      una pieza apagada (tienen que verla, por lo del duplicado). El corte va en el
 *      BORDE: el endpoint que dispara al agente.
 *
 * Hoy hay 0 piezas apagadas en la base, así que esto es una decisión a tomar, no una
 * deuda que esté doliendo.
 */
export const onlyEnabled: Prisma.ProjectCanvasWhereInput = { disabledAt: null };

/** Mismo criterio, en memoria: para listas ya cargadas. */
export function isPieceEnabled(canvas: { disabledAt: Date | null }): boolean {
  return canvas.disabledAt === null;
}
