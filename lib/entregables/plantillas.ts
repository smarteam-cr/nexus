/**
 * lib/entregables/plantillas.ts — de la plantilla de un entregable a su TEMPLATE del motor (las defs de
 * components/landing/configs). Server-safe; no se importa desde la pantalla (las defs pesan).
 *
 * Cada plantilla de ./registro.ts tiene su template acá, y `registro.test.ts` lo verifica. Hoy son los templates de
 * siempre de cada documento: generar con la plantilla de siempre manda al modelo EXACTAMENTE lo mismo que antes.
 */
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { KICKOFF_TEMPLATE } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { DESARROLLO_TEMPLATE } from "@/components/landing/configs/desarrollo.defs";
import { ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";

/** id de la plantilla → su template. */
export const TEMPLATE_DE_LA_PLANTILLA: Readonly<Record<string, BcTemplateDef>> = {
  kickoff: KICKOFF_TEMPLATE,
  "diagnostico-estrategico": DIAGNOSTICO_TEMPLATE,
  planificacion: PLANIFICACION_TEMPLATE,
  integraciones: DESARROLLO_TEMPLATE,
  entrega: ENTREGA_TEMPLATE,
};

export function templateDeLaPlantilla(id: string): BcTemplateDef {
  const t = TEMPLATE_DE_LA_PLANTILLA[id];
  if (!t) throw new Error(`La plantilla «${id}» no tiene template (lib/entregables/plantillas.ts).`);
  return t;
}
