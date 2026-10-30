/**
 * lib/artefactos/catalogo.ts — EL CATÁLOGO DE SECCIONES DE CADA TIPO (etapa V2 de docs/artefactos-plan.md). Server-safe
 * (importa las defs del motor; las secciones de cada plantilla las muestra «Nuevo artefacto»).
 *
 * Sale del código, no se escribe dos veces: el catálogo de un tipo es la lista de sus defs en el orden del canon de su
 * canvas (lib/canvas/canvas-defs.ts) — la unión de las secciones de sus plantillas —, y cada plantilla es un subconjunto
 * de ese catálogo. Las secciones `ctxDriven` (el cronograma del kickoff, la estimación del requerimiento) leen el
 * proyecto: una COPIA no las lleva, salvo la portada y el cierre, que son la identidad del documento.
 *
 * Los tipos nuevos (el plan de adopción y la hoja de ruta) y el requerimiento técnico tienen su template en el motor
 * (components/landing/configs/) y sus plantillas en ./tipos.ts.
 *
 * Congelado por ./tipos.test.ts: cambiar el catálogo de un tipo es decisión de producto, como lib/landing/registry.test.ts.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { canvasDefForSlug, type CanvasDefinition, type CanvasSectionDef } from "@/lib/canvas/canvas-defs";
import { KICKOFF_DEF_BY_KEY, KICKOFF_HANDOFF_KEYS } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_DEF_BY_KEY, DIAGNOSTICO_HANDOFF_KEYS } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_HANDOFF_KEYS } from "@/components/landing/configs/planificacion.defs";
import { EXPLORACION_DEF_BY_KEY, EXPLORACION_HANDOFF_KEYS, EXPLORACION_TEMPLATE } from "@/components/landing/configs/exploracion.defs";
import { DESARROLLO_HANDOFF_KEYS } from "@/components/landing/configs/desarrollo.defs";
import { ENTREGA_HANDOFF_KEYS } from "@/components/landing/configs/entrega.defs";
import { ENTREGA_DEF_BY_KEY_CON_ADICIONALES, PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES } from "@/components/landing/configs/plantillas-adicionales.defs";
import { HOJA_DE_RUTA_HANDOFF_KEYS, HOJA_DE_RUTA_TEMPLATE } from "@/components/landing/configs/hoja-de-ruta.defs";
import { IMPLEMENTACION_DEF_BY_KEY, IMPLEMENTACION_TEMPLATE } from "@/components/landing/configs/implementacion.defs";
import { ADOPCION_HANDOFF_KEYS, ADOPCION_TEMPLATE } from "@/components/landing/configs/adopcion.defs";
import { INTEGRACION_TEMPLATE } from "@/components/landing/configs/integracion.defs";
import { entregableDe } from "@/lib/entregables/registro";
import { templateDeLaPlantilla } from "@/lib/entregables/plantillas";
import { plantillaDelTipo, plantillasDelTipo, tipoDeArtefacto, TIPO_HOJA_DE_RUTA, TIPO_REQUERIMIENTO_TECNICO, TIPO_PLAN_DE_ADOPCION } from "./tipos";

/** Los tipos que ya existían: sus defs por key (el canon y el orden salen de su canvas). */
const DEFS_POR_KEY_DE_LOS_DE_SIEMPRE: Readonly<Record<string, Record<string, BCSectionDef>>> = {
  kickoff: KICKOFF_DEF_BY_KEY,
  diagnosis: DIAGNOSTICO_DEF_BY_KEY,
  planning: PLANIFICACION_DEF_BY_KEY_CON_ADICIONALES,
  exploration: EXPLORACION_DEF_BY_KEY,
  delivery: ENTREGA_DEF_BY_KEY_CON_ADICIONALES,
  implementation: IMPLEMENTACION_DEF_BY_KEY,
};

/** Los tipos nuevos y el requerimiento técnico, que junta dos documentos: su template ES su canon. */
const TEMPLATE_DE_LOS_NUEVOS: Readonly<Record<string, BcTemplateDef>> = {
  [TIPO_PLAN_DE_ADOPCION]: ADOPCION_TEMPLATE,
  [TIPO_HOJA_DE_RUTA]: HOJA_DE_RUTA_TEMPLATE,
  [TIPO_REQUERIMIENTO_TECNICO]: INTEGRACION_TEMPLATE,
};

/** Los tipos que no son entregables y tienen un solo template (no pasan por lib/entregables/plantillas.ts). */
const TEMPLATE_UNICO: Readonly<Record<string, BcTemplateDef>> = {
  exploration: EXPLORACION_TEMPLATE,
  implementation: IMPLEMENTACION_TEMPLATE,
};

const HANDOFF_KEYS: Readonly<Record<string, readonly string[]>> = {
  kickoff: KICKOFF_HANDOFF_KEYS,
  diagnosis: DIAGNOSTICO_HANDOFF_KEYS,
  planning: PLANIFICACION_HANDOFF_KEYS,
  exploration: EXPLORACION_HANDOFF_KEYS,
  [TIPO_REQUERIMIENTO_TECNICO]: DESARROLLO_HANDOFF_KEYS,
  delivery: ENTREGA_HANDOFF_KEYS,
  [TIPO_PLAN_DE_ADOPCION]: ADOPCION_HANDOFF_KEYS,
  [TIPO_HOJA_DE_RUTA]: HOJA_DE_RUTA_HANDOFF_KEYS,
};

/**
 * Las defs de un tipo, en el orden de su canon. null = un tipo que no vive en un canvas del motor (o no existe).
 *
 * El canon es el de su canvas MÁS lo que alguna plantilla suma y el canvas de siempre no crea (las cuatro secciones del
 * kickoff de un servicio recurrente: KICKOFF_SECCIONES_DEL_SERVICIO). Cada una de esas entra justo después de la sección
 * que la precede en las defs del motor. Las secciones retiradas (solo lectura hasta regenerarse) no son del catálogo.
 */
export function defsDelTipo(tipo: string): readonly BCSectionDef[] | null {
  const nuevo = TEMPLATE_DE_LOS_NUEVOS[tipo];
  if (nuevo) return nuevo.sections;
  const porKey = DEFS_POR_KEY_DE_LOS_DE_SIEMPRE[tipo];
  const canvas = canvasDefForSlug(tipo);
  if (!porKey || !canvas) return null;
  const orden = canvas.sections.map((s) => s.key);
  const ordenDeLasDefs = Object.keys(porKey);
  for (const p of plantillasDelTipo(tipo)) {
    for (const k of p.secciones ?? []) {
      if (orden.includes(k) || !porKey[k]) continue;
      const antes = ordenDeLasDefs.slice(0, ordenDeLasDefs.indexOf(k)).reverse().find((x) => orden.includes(x));
      orden.splice(antes ? orden.indexOf(antes) + 1 : 0, 0, k);
    }
  }
  // Las secciones que suma una plantilla viven después del cierre en las defs: el cierre sigue cerrando.
  const cierre = tipoDeArtefacto(tipo)?.estructurales[1];
  if (cierre && orden.includes(cierre)) orden.push(...orden.splice(orden.indexOf(cierre), 1));
  return orden.map((k) => porKey[k]).filter((d): d is BCSectionDef => !!d);
}

export interface SeccionDelCatalogo {
  key: string;
  nombre: string;
  /** Para qué sirve (la ⓘ de la sección), si la tiene. */
  tip: string | null;
  /** La escribe el agente. */
  agentGenerated: boolean;
  /** Lee el proyecto: no va dos veces ni en una copia (salvo si es estructural). */
  ctxDriven: boolean;
  /** La portada o el cierre: va en toda plantilla. */
  estructural: boolean;
}

/** El catálogo de un tipo: lo que el armador (V5) puede elegir. Vacío si el tipo no vive en el motor. */
export function catalogoDelTipo(tipo: string): SeccionDelCatalogo[] {
  const estructurales = new Set<string>(tipoDeArtefacto(tipo)?.estructurales ?? []);
  return (defsDelTipo(tipo) ?? []).map((d) => ({
    key: d.key,
    nombre: d.label,
    tip: d.tip ?? null,
    agentGenerated: d.agentGenerated !== false,
    ctxDriven: d.ctxDriven === true,
    estructural: estructurales.has(d.key),
  }));
}

/**
 * El template con que se genera una copia de ese tipo con esa plantilla. Los entregables de siempre usan EXACTAMENTE el
 * template de su plantilla (lib/entregables/plantillas.ts): generar una copia manda lo mismo que generar el documento de
 * siempre. Los tipos nuevos, su template filtrado a las secciones de la plantilla. Una plantilla ajena tira con su motivo.
 */
export function templateDelTipo(tipo: string, plantillaId?: string | null): BcTemplateDef {
  const t = tipoDeArtefacto(tipo);
  if (!t) throw new Error(`«${tipo}» no es un tipo de artefacto.`);
  const nuevo = TEMPLATE_DE_LOS_NUEVOS[tipo];
  const unico = TEMPLATE_UNICO[tipo];
  if (!nuevo && !unico && !entregableDe(tipo)) throw new Error(`${t.nombre} no se genera con un template del motor.`);
  const plantilla = plantillaDelTipo(tipo, plantillaId);
  if (plantillaId && !plantilla) throw new Error(`${t.nombre} no tiene la plantilla «${plantillaId}».`);
  /* La plantilla de siempre de un entregable manda EXACTAMENTE su template, también si el tipo tiene un canon más ancho. */
  if (plantilla && entregableDe(tipo)?.plantillas.some((p) => p.id === plantilla.id)) return templateDeLaPlantilla(plantilla.id);
  if (nuevo) {
    if (!plantilla) return nuevo;
    if (!plantilla.secciones) return { ...nuevo, id: `${nuevo.id}:${plantilla.id}` };
    const de = new Set(plantilla.secciones);
    return { ...nuevo, id: `${nuevo.id}:${plantilla.id}`, sections: nuevo.sections.filter((s) => de.has(s.key)) };
  }
  if (unico) return unico;
  return templateDeLaPlantilla(plantilla!.id);
}

/**
 * Las secciones con que nace una COPIA de ese tipo con esa plantilla, en el orden del canon: las de la plantilla (o el
 * canon entero), SIN las `ctxDriven` que no son la portada o el cierre — leen el proyecto, así que en una segunda copia
 * pintarían lo mismo que en la primera (el mismo criterio de lib/landing/catalogo-de-secciones.ts).
 */
export function seccionesDeUnaCopia(tipo: string, plantillaId?: string | null): BCSectionDef[] {
  const defs = defsDelTipo(tipo);
  if (!defs) return [];
  const plantilla = plantillaDelTipo(tipo, plantillaId);
  if (plantillaId && !plantilla) throw new Error(`${tipoDeArtefacto(tipo)?.nombre ?? tipo} no tiene la plantilla «${plantillaId}».`);
  const de = plantilla?.secciones ? new Set<string>(plantilla.secciones) : null;
  const estructurales = new Set<string>(tipoDeArtefacto(tipo)?.estructurales ?? []);
  const secciones = defs.filter((d) => (!de || de.has(d.key)) && (d.ctxDriven !== true || estructurales.has(d.key)));
  if (!plantilla?.ordenPropio || !plantilla.secciones) return secciones;
  const lugar = (key: string) => plantilla.secciones!.indexOf(key);
  return [...secciones].sort((a, b) => lugar(a.key) - lugar(b.key));
}

/**
 * Las secciones que pasan al DUPLICAR un documento: todas las del tipo, de cualquier plantilla y también las retiradas que
 * un documento viejo todavía muestra (duplicar no recorta lo escrito), sin las `ctxDriven` que no son la portada o el cierre.
 */
export function seccionesQuePasanAlDuplicar(tipo: string): ReadonlySet<string> {
  const defs = [...(defsDelTipo(tipo) ?? []), ...Object.values(DEFS_POR_KEY_DE_LOS_DE_SIEMPRE[tipo] ?? {})];
  const estructurales = new Set<string>(tipoDeArtefacto(tipo)?.estructurales ?? []);
  return new Set(defs.filter((d) => d.ctxDriven !== true || estructurales.has(d.key)).map((d) => d.key));
}

/**
 * La estructura con que se CREA una copia (la que consume la creación en ./copias-server.ts). Las secciones curadas se
 * siembran con lo mismo que el documento de siempre de su tipo (la `defaultData` de su canvas: el equipo y los canales del
 * kickoff, el cierre); en los tipos nuevos, con el `empty` de lo que el agente no escribe (el cierre).
 */
export function canvasDefDeUnaCopia(tipo: string, plantillaId?: string | null): CanvasDefinition {
  const t = tipoDeArtefacto(tipo);
  if (!t) throw new Error(`«${tipo}» no es un tipo de artefacto.`);
  const deSiempre = canvasDefForSlug(tipo);
  const defaultDe = new Map<string, Record<string, unknown> | undefined>((deSiempre?.sections ?? []).map((s) => [s.key, s.defaultData]));
  const sections: CanvasSectionDef[] = seccionesDeUnaCopia(tipo, plantillaId).map((d) => {
    const defaultData = deSiempre
      ? defaultDe.get(d.key)
      : d.agentGenerated === false && d.empty && typeof d.empty === "object"
        ? (d.empty as Record<string, unknown>)
        : undefined;
    return defaultData ? { key: d.key, label: d.label, defaultData } : { key: d.key, label: d.label };
  });
  return { slug: tipo, name: t.nombre, isDefault: false, order: deSiempre?.order ?? 0, sections };
}

/**
 * Las secciones del handoff que lee un tipo (allowlist: lo interno de la venta no llega a un documento que lee el
 * cliente). [] = el tipo no tiene allowlist propia (la ejecución, interna, lee el handoff por su propio camino).
 */
export function handoffKeysDelTipo(tipo: string): readonly string[] {
  return HANDOFF_KEYS[tipo] ?? [];
}
