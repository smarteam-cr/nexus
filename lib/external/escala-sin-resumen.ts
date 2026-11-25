/**
 * lib/external/escala-sin-resumen.ts — qué ve el cliente en el enlace de La escala cuando lo publicado NO tiene Resumen
 * (24 nov, Elías con TEC · AE: publicó antes de armarlo). PURO.
 *
 * Sin Resumen, la pestaña «Resumen» sería una portada con huecos: un titular de relleno («Así entendimos tu negocio.»), la
 * bajada de siempre y nada debajo. Lo seguro es no mostrarla: el enlace abre en la página de un equipo (la que pidió el
 * enlace, `?area=`, si existe; si no, la primera con algo medido; si no, la primera), que sí tiene lo suyo, y las
 * pestañas son solo las de los equipos. Cuando se arma el Resumen y se vuelve a publicar, la pestaña vuelve sola.
 * Adentro, el CSE ve la plantilla del Resumen y el aviso para armarlo (components/exploraciones/PaginaDeLaEscala.tsx).
 */

/** ¿Lo publicado trae un Resumen? (una foto publicada guarda `at`, cuándo se armó; sin él, no hay Resumen). */
export const tieneResumen = (resumen: { at?: string | null } | null | undefined): boolean => !!resumen?.at;

/** El equipo que abre el enlace sin Resumen. null: no hay ninguno (la página dice que la escala no tiene nada medido). */
export function areaSinResumen(resultados: readonly { areaId: string; preguntadas: number }[], pedida: string | null | undefined): string | null {
  if (pedida && resultados.some((r) => r.areaId === pedida)) return pedida;
  return (resultados.find((r) => r.preguntadas > 0) ?? resultados[0])?.areaId ?? null;
}
