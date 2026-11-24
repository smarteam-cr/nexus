/**
 * lib/external/secciones-de-la-escala.ts — LAS SECCIONES DE LA PÁGINA DE LA ESCALA, por su nombre (24 nov). PURO y
 * client-safe, sin dependencias: lo importan la vista del cliente y la de cada área (components/external/test) y las piezas
 * de «✨ Mejorar con IA» (lib/exploraciones/escala-con-nexus.ts).
 *
 * Elías, 24 nov: «✨ Mejorar con IA» va por SECCIÓN, no por texto, como el botón de cada sección de los documentos del
 * cliente. Cada pieza que Nexus puede cambiar dice en qué sección está (`PiezaDeLaEscala.seccion`), y el botón del
 * encabezado de esa sección manda el mismo nombre: el servidor le pasa al modelo solo las piezas de esa sección. Por eso el
 * nombre vive en UN lugar: si la pieza y el botón dijeran dos cosas distintas, el botón no encontraría nada que cambiar.
 */

/** Las secciones del Resumen, en el orden de la página. */
export const SECCIONES_DEL_RESUMEN = {
  arriba: "Arriba",
  problema: "El problema principal",
  puntos: "Puntos clave",
  operacion: "Tu operación",
  equipos: "Equipos y hallazgos",
  falta: "Lo que falta validar",
} as const;

/** La sección de un equipo dentro de «Equipos y hallazgos»: una por subequipo («Equipos y hallazgos · Televentas»). */
export const seccionDelEquipo = (nombre: string) => `${SECCIONES_DEL_RESUMEN.equipos} · ${nombre}`;

/** Las secciones de la página de un área, en el orden de la página. */
export const SECCIONES_DEL_AREA = {
  resultado: "Resultado general",
  escalera: "Dónde está hoy en la escala",
  radar: "Dónde está hoy cada parte",
  cuesta: "Lo que más le cuesta",
  empezar: "Por dónde empezar",
  casos: "Lo que haríamos contigo",
  riesgos: "Lo que suele poner en riesgo",
  partes: "Cómo está cada parte",
  abajo: "Abajo",
} as const;

/**
 * Si una pieza es de la sección pedida: la misma, o una de sus partes («Equipos y hallazgos» abarca «Equipos y hallazgos ·
 * Televentas»).
 */
export function esDeLaSeccion(seccionDeLaPieza: string, pedida: string): boolean {
  return seccionDeLaPieza === pedida || seccionDeLaPieza.startsWith(`${pedida} · `);
}
