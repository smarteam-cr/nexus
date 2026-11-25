/**
 * lib/exploraciones/fuentes-tipos.ts — la forma de una fuente que lee el agente. PURO.
 *
 * Aparte de fuentes.ts (que lee la base y HubSpot, y es de servidor) para que el pedido al agente
 * (agente-pedido.ts) y sus pruebas no carguen nada de servidor.
 */
export interface Fuente {
  /** Id corto que el modelo cita: E0 la empresa, C0 los contactos, D0 los negocios, T1 el test,
   *  H3 una actividad de HubSpot, S2 una reunión de Meet, N0 las notas del vendedor. */
  id: string;
  /** Cómo la ve el vendedor: «Reunión del 1 oct: Revisión del diagnóstico». */
  etiqueta: string;
  /**
   * Cómo la nombra el pedido a la IA, si no es la etiqueta (25 nov): una nota del equipo va sin el nombre de quien la
   * escribió (notas-del-equipo.ts › `notasParaUbicar`). Lo lee `pedidoDePosicionar`.
   */
  paraElAgente?: string;
  texto: string;
}
