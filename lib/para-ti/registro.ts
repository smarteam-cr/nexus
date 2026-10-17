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
  PRESENTACIONES,
  PROPUESTA_DE_CRONOGRAMA,
  REUNIONES_SIN_REVISAR,
} from "./fuentes/proyectos";
import { PREVENTAS } from "./fuentes/preventa";
import { NEGOCIOS } from "./fuentes/negocios";
import { ETAPA_SUGERIDA } from "./fuentes/etapa";
import { LO_QUE_DEJARON_TUS_REUNIONES } from "./fuentes/reuniones";
import { TIEMPOS_SIN_ANOTAR } from "./fuentes/tiempos";
import { TAREAS } from "./fuentes/tareas";
import { FINANZAS_DEVUELTO, FINANZAS_REGISTRAR, FINANZAS_SUPERVISAR } from "./fuentes/finanzas";
import { CRONOGRAMAS_TRABADOS, SIN_ENCARGADO, VIGIA } from "./fuentes/cs";
import { CORRECCION_QUE_CADUCO, RELACION_CON_HUBSPOT, RELACIONES_DE_LA_CARTERA } from "./fuentes/cartera-de-la-csl";
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
  ETAPA_SUGERIDA,
  REUNIONES_SIN_REVISAR,
  LO_QUE_DEJARON_TUS_REUNIONES,
  ALTA_A_MEDIO_HACER,
  PEDIDOS_FUERA_DE_ALCANCE,
  PRESENTACIONES,
  PREVENTAS,
  NEGOCIOS,
  FINANZAS_DEVUELTO,
  TIEMPOS_SIN_ANOTAR,
  TAREAS,
  RELACION_CON_HUBSPOT,
  CORRECCION_QUE_CADUCO,
  // Por frente: lo que es tuyo porque lo llevas.
  VIGIA,
  RELACIONES_DE_LA_CARTERA,
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
