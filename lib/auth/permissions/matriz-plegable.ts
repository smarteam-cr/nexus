/**
 * lib/auth/permissions/matriz-plegable.ts — QUÉ ÁREAS DE LA MATRIZ DE PERMISOS SE VEN ABIERTAS. Puro, client-safe.
 *
 * La matriz (components/team/PermissionMatrix.tsx) pliega cada área a una palabra («Todo», «Nada», «3 de 5») y abre
 * sola las mezcladas, que es donde hay algo que leer.
 *
 * ⚠ Hasta el 2026-10-05 la regla era `abierta = abiertaAMano || hayMezcla`, recalculada en cada render:
 *   · un área mezclada NO se podía plegar (el clic sacaba la marca «a mano», pero la mezcla la volvía a abrir);
 *   · y al completarla desde sus casillas se cerraba SOLA en la cara de quien la estaba editando.
 * Ahora la mezcla decide solo el estado INICIAL, tomado una vez al abrir la matriz; desde que la persona toca la
 * cabecera de un área, ese área es suya.
 */

/** ¿Algunas acciones del área están encendidas y otras no? */
export function hayMezcla(encendidas: number, total: number): boolean {
  return encendidas > 0 && encendidas < total;
}

/** Las áreas que arrancan abiertas: las mezcladas al abrir la matriz. Se calcula UNA vez. */
export function areasAbiertasAlInicio(
  areas: readonly { key: string; encendidas: number; total: number }[],
): ReadonlySet<string> {
  return new Set(areas.filter((a) => hayMezcla(a.encendidas, a.total)).map((a) => a.key));
}

/** ¿Se ve abierta? Lo que la persona decidió en la cabecera manda; si nunca la tocó, como arrancó. */
export function estaAbierta(
  key: string,
  decididas: ReadonlyMap<string, boolean>,
  alInicio: ReadonlySet<string>,
): boolean {
  return decididas.get(key) ?? alInicio.has(key);
}

/** Tocar la cabecera invierte lo que SE VE (no una marca aparte) y desde ahí el área queda en manos de la persona. */
export function alTocarCabecera(
  key: string,
  decididas: ReadonlyMap<string, boolean>,
  alInicio: ReadonlySet<string>,
): Map<string, boolean> {
  const siguiente = new Map(decididas);
  siguiente.set(key, !estaAbierta(key, decididas, alInicio));
  return siguiente;
}
