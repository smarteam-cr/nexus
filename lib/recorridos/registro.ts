/**
 * lib/recorridos/registro.ts — EL registro de recorridos guiados.
 *
 * El contenido vive por área en `contenido/*.ts`; acá se juntan. Un recorrido nuevo = una entrada
 * en su área + el `data-recorrido` en cada cosa que señala + la prop `recorrido` en la cabecera de
 * su pantalla (o `usePantallaDelRecorrido` si es una pieza de un lienzo). `recorridos.test.ts`
 * frena el merge si un ancla no existe en el código, si un rol no existe o si un texto está en
 * voseo.
 *
 * Diseño: el tablero «Recorridos · diseño» (Claude Design, sistema «Nexus · interfaz interna»).
 */
import type { Recorrido } from "./tipos";
import { CLIENTES_LISTADO, FICHA_CRONOGRAMA, FICHA_DEL_CLIENTE, FICHA_EXPLORACION, FICHA_INFORMACION } from "./contenido/clientes";
import { EXITO_CUENTA, EXITO_LISTADO } from "./contenido/exito";
import { ESCALA } from "./contenido/escala";
import { FEEDBACK } from "./contenido/feedback";
import { PREVENTA, PREVENTA_LISTADO } from "./contenido/preventa";
import {
  FINANZAS_AGUINALDO,
  FINANZAS_CAJA_NETA,
  FINANZAS_CIERRE,
  FINANZAS_COBRANZA,
  FINANZAS_COMISIONES_PARTNER,
  FINANZAS_COMISIONES_VENDEDOR,
  FINANZAS_CONCILIACION,
  FINANZAS_EQUILIBRIO,
  FINANZAS_GASTOS,
  FINANZAS_INGRESOS,
  FINANZAS_INTEGRACIONES,
  FINANZAS_PENDIENTES,
  FINANZAS_PLANILLA,
  FINANZAS_PLANILLA_CALENDARIO,
  FINANZAS_PLANILLA_HISTORIAL,
  FINANZAS_RECURRENTES,
  FINANZAS_REPORTES,
  FINANZAS_SUPERVISION,
  FINANZAS_TARJETAS,
} from "./contenido/finanzas";

/**
 * La primera vez que alguien abre una pantalla con un recorrido que nunca vio, el botón ofrece
 * verlo con una invitación chica, sin oscurecer nada y que se cierra con «Ahora no». Es la opción
 * del tablero 2; en `false` queda solo el punto azul junto a «Recorrido».
 */
export const INVITAR_LA_PRIMERA_VEZ = true;

/** En el orden en que aparecen en «Tus recorridos» (dentro de cada grupo). */
export const RECORRIDOS: readonly Recorrido[] = [
  // Clientes
  CLIENTES_LISTADO,
  FICHA_DEL_CLIENTE,
  FICHA_CRONOGRAMA,
  FICHA_EXPLORACION,
  FICHA_INFORMACION,
  EXITO_LISTADO,
  EXITO_CUENTA,
  // Ventas
  PREVENTA_LISTADO,
  PREVENTA,
  // Finanzas, en el orden del menú
  FINANZAS_PENDIENTES,
  FINANZAS_SUPERVISION,
  FINANZAS_CIERRE,
  FINANZAS_COBRANZA,
  FINANZAS_COMISIONES_PARTNER,
  FINANZAS_INGRESOS,
  FINANZAS_GASTOS,
  FINANZAS_RECURRENTES,
  FINANZAS_TARJETAS,
  FINANZAS_PLANILLA,
  FINANZAS_PLANILLA_HISTORIAL,
  FINANZAS_PLANILLA_CALENDARIO,
  FINANZAS_AGUINALDO,
  FINANZAS_COMISIONES_VENDEDOR,
  FINANZAS_CONCILIACION,
  FINANZAS_EQUILIBRIO,
  FINANZAS_CAJA_NETA,
  FINANZAS_INTEGRACIONES,
  FINANZAS_REPORTES,
  // Dirección
  FEEDBACK,
  // Para todo el equipo
  ESCALA,
];

export function recorridoPorId(id: string): Recorrido | null {
  return RECORRIDOS.find((r) => r.id === id) ?? null;
}
