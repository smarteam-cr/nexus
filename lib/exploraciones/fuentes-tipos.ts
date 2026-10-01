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
  texto: string;
}
