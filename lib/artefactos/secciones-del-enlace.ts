/**
 * lib/artefactos/secciones-del-enlace.ts — QUÉ SALE POR EL ENLACE PROPIO DE UN DOCUMENTO DE PROYECTO (etapa V4 de
 * docs/artefactos-plan.md). PURO y server-safe (importa las defs del motor: no se carga en la pantalla).
 *
 * El enlace es para compartir pantalla con el cliente: sale lo que el documento dice, no lo que el equipo trabaja. Por eso,
 * por tipo, se decide con sus DEFS:
 *   · sale toda sección de la definición del tipo y toda sección creada por una persona (`custom:*`);
 *   · NO sale una sección que lee el proyecto (`ctxDriven`: el cronograma, los procesos, la estimación del equipo técnico)
 *     salvo la portada y el cierre, que son la identidad del documento y pintan su propio `data`;
 *   · NO sale una sección interna de su tipo (`SECCIONES_INTERNAS`), aunque deje de ser `ctxDriven` algún día;
 *   · NO sale una key que el tipo no conoce: falla cerrado.
 * Un tipo sin defs acá o que no lee el cliente no se comparte. La entrega de siempre tampoco (`sinEnlaceElDeSiempre`): guarda
 * en su Json lo que el cliente no ve, y por eso no se duplica. Sí se comparte un informe de avance, que nace en blanco.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { ADOPCION_DEF_BY_KEY } from "@/components/landing/configs/adopcion.defs";
import { INTEGRACION_DEF_BY_KEY } from "@/components/landing/configs/integracion.defs";
import { HOJA_DE_RUTA_DEF_BY_KEY } from "@/components/landing/configs/hoja-de-ruta.defs";
import { ENTREGA_DEF_BY_KEY_CON_ADICIONALES, PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES } from "@/components/landing/configs/plantillas-adicionales.defs";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { admiteCopias, TIPO_HOJA_DE_RUTA, TIPO_REQUERIMIENTO_TECNICO, TIPO_PLAN_DE_ADOPCION, tipoDeArtefacto } from "./tipos";

/** Las defs de cada tipo que se puede compartir por enlace. La exploración no está: es interna. */
const DEFS_DEL_ENLACE: Readonly<Record<string, Record<string, BCSectionDef>>> = {
  kickoff: KICKOFF_DEF_BY_KEY,
  diagnosis: DIAGNOSTICO_DEF_BY_KEY,
  planning: PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES,
  [TIPO_PLAN_DE_ADOPCION]: ADOPCION_DEF_BY_KEY,
  [TIPO_REQUERIMIENTO_TECNICO]: INTEGRACION_DEF_BY_KEY,
  [TIPO_HOJA_DE_RUTA]: HOJA_DE_RUTA_DEF_BY_KEY,
  delivery: ENTREGA_DEF_BY_KEY_CON_ADICIONALES,
};

/** Las secciones que el cliente nunca ve por el enlace, por tipo: lo que estima o decide el equipo por dentro. */
export const SECCIONES_INTERNAS: Readonly<Record<string, readonly string[]>> = {
  [TIPO_REQUERIMIENTO_TECNICO]: ["estimacion"],
  // Lo que la entrega de cierre calcula o guarda sin mostrar (`logros` lleva objetivos propuestos con su evidencia): un informe de avance no lo lleva.
  delivery: ["logros", "cumplimiento", "impacto", "escala", "desafio_resuelto", "alcance", "pendientes", "continuidad"],
};

/** ¿Este tipo se comparte por su enlace propio? Lo lee el cliente y se sabe qué sale. */
export function tipoCompartible(tipo: string | null | undefined): boolean {
  return !!tipo && admiteCopias(tipo) && !!tipoDeArtefacto(tipo)?.clientFacing && tipo in DEFS_DEL_ENLACE;
}

/** El filtro de las secciones de un tipo que salen por el enlace (ver el encabezado). */
export function seccionesQueSalenPorElEnlace(tipo: string): (key: string) => boolean {
  const defs = DEFS_DEL_ENLACE[tipo];
  if (!defs || !tipoCompartible(tipo)) return () => false;
  const estructurales = new Set<string>(tipoDeArtefacto(tipo)?.estructurales ?? []);
  const internas = new Set(SECCIONES_INTERNAS[tipo] ?? []);
  return (key) => {
    if (internas.has(key)) return false;
    if (esCustomKey(key)) return true;
    const def = defs[key];
    if (!def) return false;
    return !def.ctxDriven || estructurales.has(key);
  };
}
