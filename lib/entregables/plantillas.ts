/**
 * lib/entregables/plantillas.ts — de la plantilla de un entregable a su TEMPLATE del motor (las defs de
 * components/landing/configs). Server-safe; no se importa desde la pantalla (las defs pesan).
 *
 * Cada plantilla de ./registro.ts tiene su template acá, y `registro.test.ts` lo verifica. La de siempre de cada documento
 * es su template de siempre: generar con ella manda al modelo EXACTAMENTE lo mismo que antes. El «Diagnóstico esencial»
 * (2026-10-23) es el mismo agente con menos secciones.
 */
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { KICKOFF_RECURRENTE_TEMPLATE, KICKOFF_TEMPLATE } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_ESENCIAL_TEMPLATE, DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_ESENCIAL_TEMPLATE, PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { DESARROLLO_TEMPLATE } from "@/components/landing/configs/desarrollo.defs";
import { ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";

/** id de la plantilla → su template. */
export const TEMPLATE_DE_LA_PLANTILLA: Readonly<Record<string, BcTemplateDef>> = {
  kickoff: KICKOFF_TEMPLATE,
  "kickoff-recurrente": KICKOFF_RECURRENTE_TEMPLATE,
  "diagnostico-estrategico": DIAGNOSTICO_TEMPLATE,
  "diagnostico-esencial": DIAGNOSTICO_ESENCIAL_TEMPLATE,
  planificacion: PLANIFICACION_TEMPLATE,
  "planificacion-esencial": PLANIFICACION_ESENCIAL_TEMPLATE,
  integraciones: DESARROLLO_TEMPLATE,
  entrega: ENTREGA_TEMPLATE,
};

export function templateDeLaPlantilla(id: string): BcTemplateDef {
  const t = TEMPLATE_DE_LA_PLANTILLA[id];
  if (!t) throw new Error(`La plantilla «${id}» no tiene template (lib/entregables/plantillas.ts).`);
  return t;
}
