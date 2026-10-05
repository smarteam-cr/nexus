/**
 * lib/para-ti/registro.ts — TODAS las fuentes de «Para ti», en un solo lugar (2026-10-04). SERVER-ONLY.
 *
 * Sumar algo que avise = una entrada acá. `lib/para-ti/registro.test.ts` vigila que cada fuente tenga clave única, que
 * cada frente activo tenga al menos una fuente o un aviso que lo use (un frente que no trae nada es un interruptor que
 * no hace nada), y que ninguna personal dependa de un frente.
 */
import "server-only";
import type { Fuente } from "./fuente";
import {
  ALTA_A_MEDIO_HACER,
  PEDIDOS_FUERA_DE_ALCANCE,
  PENDIENTES_DE_REUNIONES,
  PROPUESTA_DE_CRONOGRAMA,
  REUNIONES_SIN_REVISAR,
} from "./fuentes/proyectos";
import { PREVENTAS } from "./fuentes/preventa";
import { FINANZAS_DEVUELTO, FINANZAS_REGISTRAR, FINANZAS_SUPERVISAR } from "./fuentes/finanzas";
import { CRONOGRAMAS_TRABADOS, SIN_ENCARGADO, VIGIA } from "./fuentes/cs";
import {
  COMENTARIOS_DE_LA_DOCUMENTACION,
  COMENTARIOS_DE_LA_ESCALA,
  MARKETING_POR_REVISAR,
  PEDIDOS_PARA_VENTAS,
  PROCESOS_QUE_FALLARON,
} from "./fuentes/equipo-y-sistema";

export const FUENTES: readonly Fuente[] = [
  // Personales: lo que es tuyo por el dato.
  PROPUESTA_DE_CRONOGRAMA,
  REUNIONES_SIN_REVISAR,
  ALTA_A_MEDIO_HACER,
  PENDIENTES_DE_REUNIONES,
  PEDIDOS_FUERA_DE_ALCANCE,
  PREVENTAS,
  FINANZAS_DEVUELTO,
  // Por frente: lo que es tuyo porque lo llevas.
  VIGIA,
  CRONOGRAMAS_TRABADOS,
  SIN_ENCARGADO,
  PEDIDOS_PARA_VENTAS,
  FINANZAS_REGISTRAR,
  FINANZAS_SUPERVISAR,
  MARKETING_POR_REVISAR,
  COMENTARIOS_DE_LA_ESCALA,
  COMENTARIOS_DE_LA_DOCUMENTACION,
  PROCESOS_QUE_FALLARON,
];
