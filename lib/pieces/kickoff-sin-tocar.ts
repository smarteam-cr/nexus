/**
 * lib/pieces/kickoff-sin-tocar.ts — ¿el kickoff sigue como nació? Puro y testeable.
 *
 * El selector de plantilla reemplaza al documento, así que solo sale si nadie lo tocó: sin publicar, sin plantilla anotada,
 * sin contenido y con cada sección sembrada igual a su semilla. `hasContent` no alcanza: no cuenta lo escrito a mano en
 * equipo, horarios, canales y cierre, y dos kickoffs publicados de producción tenían eso (revisión del 2026-10-30). Una
 * semilla de una versión vieja se lee como tocada: abre el documento, que es lo de siempre.
 */
const orden = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(orden)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, orden(x)]))
      : v;

export const mismoDato = (a: unknown, b: unknown): boolean => JSON.stringify(orden(a ?? null)) === JSON.stringify(orden(b ?? null));

export function kickoffSinTocar(o: {
  publicado: boolean;
  plantillaAnotada: boolean;
  conContenido: boolean;
  /** Los bloques de las secciones sembradas, con su semilla. */
  sembrados: ReadonlyArray<{ data: unknown; semilla: unknown }>;
}): boolean {
  if (o.publicado || o.plantillaAnotada || o.conContenido) return false;
  return o.sembrados.every((b) => mismoDato(b.data, b.semilla));
}
