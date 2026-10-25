/**
 * lib/db/unico-violado.ts — ¿este error es un único que chocó (P2002)? PURO.
 *
 * Con el adaptador de pg, Prisma manda el P2002 sin `meta.target` útil cuando el índice no está declarado en el
 * esquema (lib/pieces/ensure-canvas.ts), así que NO se adivina cuál chocó: el que lo atrapa vuelve a leer por la llave
 * que le importa. Antes había dos copias de esta función (lib/exploraciones/crear.ts y del-proyecto.ts).
 */
export function esUnicoViolado(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}
