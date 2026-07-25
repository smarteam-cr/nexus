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
