/**
 * components/exploraciones/escala-al-dia.ts — el aviso de que la página de la escala cambió (16 nov). Lo disparan la
 * página interna al ponerse al día (PaginaDeLaEscala.tsx) y «Acceso» al crear o revocar el enlace (AccesoALaEscala.tsx);
 * lo escucha «Publicar» (PublicarLaEscala.tsx) para volver a mirar si hay cambios que el cliente no ve.
 */
export const ESCALA_AL_DIA = "nexus:escala-al-dia";

export function avisarQueLaEscalaCambio(): void {
  window.dispatchEvent(new Event(ESCALA_AL_DIA));
}

/** Lo dispara «Publicar» al publicar: «Acceso» vuelve a leer la fecha de lo publicado. */
export const ESCALA_PUBLICADA = "nexus:escala-publicada";

export function avisarQueSePublico(): void {
  window.dispatchEvent(new Event(ESCALA_PUBLICADA));
}
