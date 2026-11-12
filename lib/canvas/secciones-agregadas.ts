/**
 * lib/canvas/secciones-agregadas.ts — LO QUE UNA PERSONA AGREGA A UN DOCUMENTO, Y CÓMO LO RESPETA LA PLANTILLA. PURO.
 *
 * Elías, 12 nov: en los documentos del proyecto (Diagnóstico, Planificación, Kickoff…) no había cómo sumar una sección
 * sin pedírsela al chat, y un «Diagnóstico esencial» no podía traer una del «Diagnóstico completo». Ahora, al pie del
 * documento, «+ Agregar sección» ofrece:
 *   1. las secciones del CATÁLOGO de su tipo que el documento no tiene (lib/artefactos/catalogo.ts: la unión de las
 *      secciones de sus plantillas, sin la portada, el cierre ni las que leen el proyecto), que la IA sabe escribir;
 *   2. una sección propia (`custom:*`, lib/landing/custom-sections.ts), que se escribe a mano.
 *
 * ── POR QUÉ UNA MARCA EN EL JSON ───────────────────────────────────────────────────────────────────────────────────
 * La plantilla anotada (`__plantilla`) decide qué secciones tiene el documento: al generar, la IA escribe las de su
 * template; después, `ajustarALaPlantilla` (y su par del kickoff) oculta o borra las del canon que la plantilla no trae.
 * Sin una marca, la sección que la persona agregó era una «del completo» más: la escondía la siguiente generación. La
 * marca `agregadaPorPersona` va en la entry del Json del canvas (como `hidden` y `ocultaPorLaPlantilla`: sin columna
 * nueva, regla de las dos PCs) y dice «esta la quiso una persona». Con ella:
 *   · el template con que se genera la suma (`templateConLasAgregadas`): la IA la llena;
 *   · el ajuste a la plantilla la cuenta como de la plantilla (`conLasAgregadas`): ni se oculta ni se borra.
 * Se va con la sección: borrarla borra su entry.
 */
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { parseSectionEntries, patchSectionEntry, SECCIONES_SOLO_INTERNAS, type CanvasSectionEntry } from "@/lib/business-cases/section-briefs";
import { esCustomKey, originalDeLaCopia } from "@/lib/landing/custom-sections";

/** Las keys que una persona agregó a propósito (la marca `agregadaPorPersona` de su entry). */
export function seccionesAgregadas(sections: unknown): string[] {
  return parseSectionEntries(sections)
    .filter((e) => e.agregadaPorPersona === true && !e.key.startsWith("__"))
    .map((e) => e.key);
}

/** Las secciones de la plantilla MÁS las que agregó una persona: lo que el ajuste a la plantilla no oculta ni borra. */
export function conLasAgregadas(deLaPlantilla: Iterable<string>, sections: unknown): Set<string> {
  return new Set([...deLaPlantilla, ...seccionesAgregadas(sections)]);
}

/**
 * El template con que se genera, con las secciones que agregó una persona y la plantilla no trae. Van en el orden del
 * catálogo (el canon del tipo) y con su def de siempre (su schema, su guía). Sin agregadas nuevas devuelve el MISMO
 * template: generar manda al modelo exactamente lo de antes.
 *
 * ⚠ La intro del agente de una plantilla liviana puede decir qué secciones NO van («no hay cómo va a operar…»). Por eso
 * se le suma, al final, cuáles agregó la persona: si no, el modelo las saltaba aunque estuvieran en su formato.
 */
export function templateConLasAgregadas(template: BcTemplateDef, catalogo: readonly BCSectionDef[], agregadas: readonly string[]): BcTemplateDef {
  const tiene = new Set(template.sections.map((s) => s.key));
  const quiere = new Set(agregadas);
  const suma = catalogo.filter((d) => quiere.has(d.key) && !tiene.has(d.key));
  if (!suma.length) return template;
  const orden = new Map(catalogo.map((d, i) => [d.key, i]));
  const sections = [...template.sections, ...suma].sort((a, b) => (orden.get(a.key) ?? Infinity) - (orden.get(b.key) ?? Infinity));
  const escritas = suma.filter((d) => d.agentGenerated !== false);
  const aviso = escritas.length
    ? `\n\nSECCIONES QUE AGREGÓ QUIEN EDITA ESTE DOCUMENTO: además de las de esta plantilla, agregó a propósito ${escritas
        .map((d) => `«${d.label}» (${d.key})`)
        .join(", ")}. Están en tu formato y las escribes como las demás, con la misma regla de no afirmar nada que las fuentes no respalden.`
    : "";
  /* El tope de la respuesta crece con lo que se suma (revisión del 12 nov): el de una plantilla liviana está pensado para
     sus secciones, y con varias del completo la respuesta se cortaba — el generador ABORTA sin guardar si llega al tope, y
     la corrida se cobra igual. Nunca por encima de TOPE_DE_TOKENS_SIN_STREAMING. */
  const maxTokens = Math.min(
    Math.max(template.maxTokens ?? 8000, TOPE_DE_TOKENS_SIN_STREAMING),
    (template.maxTokens ?? 8000) + TOKENS_POR_SECCION_AGREGADA * escritas.length,
  );
  return { ...template, sections, maxTokens, ...(aviso ? { agentIntro: `${template.agentIntro ?? ""}${aviso}` } : {}) };
}

/** Cuánto suma al tope de la respuesta cada sección agregada que escribe la IA (el completo: ~1.400 por sección). */
export const TOKENS_POR_SECCION_AGREGADA = 1_500;
/**
 * El techo: la generación es una llamada SIN streaming, y por encima de ~21.300 el SDK la rechaza antes de mandarla
 * (components/landing/configs/diagnostico.defs.ts). 21.000 es el de la Planificación completa, que funciona.
 */
export const TOPE_DE_TOKENS_SIN_STREAMING = 21_000;

/**
 * La marca se va cuando la plantilla del documento ya trae la sección (de la esencial a la completa): desde ahí es de la
 * plantilla, no de la persona, y «Borrar» no se le ofrece (borrarla la haría volver vacía en la próxima generación).
 */
export function sinMarcaLasDeLaPlantilla(sections: unknown, deLaPlantilla: ReadonlySet<string>): { entradas: CanvasSectionEntry[]; cambio: boolean } {
  let entradas = parseSectionEntries(sections);
  let cambio = false;
  for (const e of [...entradas]) {
    if (e.agregadaPorPersona === true && deLaPlantilla.has(e.key)) {
      entradas = patchSectionEntry(entradas, e.key, { agregadaPorPersona: false });
      cambio = true;
    }
  }
  return { entradas, cambio };
}

/**
 * ¿Se puede duplicar esta sección? Una creada por una persona sí; una copia, si se puede su original. Una de plantilla, si
 * es del catálogo del tipo y no es la portada, el cierre, una de las que leen el proyecto (la copia pintaría lo mismo) ni
 * una solo interna (lo que la deja fuera del cliente es su key, y la copia no la tendría). null = sí; si no, el motivo.
 */
export function motivoParaNoDuplicar(
  key: string,
  catalogo: ReadonlyArray<{ key: string; ctxDriven: boolean; estructural: boolean }>,
): string | null {
  const original = originalDeLaCopia(key);
  if (original) return motivoParaNoDuplicar(original, catalogo);
  if (esCustomKey(key)) return null;
  if (SECCIONES_SOLO_INTERNAS.has(key)) return "Esta sección es solo del equipo: no se duplica.";
  const s = catalogo.find((x) => x.key === key);
  if (!s) return "Esta sección no se puede duplicar.";
  if (s.estructural) return "La portada y el cierre no se duplican: el documento tiene uno de cada uno.";
  if (s.ctxDriven) return "Esta sección muestra datos del proyecto: una copia mostraría lo mismo.";
  return null;
}

/**
 * ¿Se puede BORRAR esta sección? En el documento de siempre, solo las de la persona: las propias (`custom:*`, también las
 * copias) y las del catálogo que agregó (con la marca). Las de la plantilla se ocultan con el ojo: la reconciliación las
 * volvería a crear. En una copia de artefacto, también las de su plantilla menos la portada y el cierre (Elías, 30 oct).
 */
export function sePuedeBorrar(o: { key: string; sections: unknown; enUnaCopia: boolean; estructurales: readonly string[] }): boolean {
  if (esCustomKey(o.key)) return true;
  if (o.enUnaCopia) return !o.estructurales.includes(o.key);
  return parseSectionEntries(o.sections).some((e) => e.key === o.key && e.agregadaPorPersona === true);
}

/** Una sección del catálogo que se puede agregar, tal como la ofrece «+ Agregar sección». */
export interface SeccionAgregable {
  key: string;
  nombre: string;
  /** Para qué sirve (la ⓘ de la sección), si la tiene. */
  tip: string | null;
  /** La escribe la IA al generar. false = se llena a mano. */
  laEscribeLaIa: boolean;
  /** Ya está en el documento, oculta por la plantilla: agregarla la vuelve a mostrar con lo que tenía. */
  ocultaPorLaPlantilla: boolean;
}

/**
 * Lo que «+ Agregar sección» ofrece: las del catálogo del tipo que el documento no muestra. Quedan afuera la portada y el
 * cierre (todo documento los tiene), las que leen el proyecto (el cronograma del kickoff: una segunda pintaría lo mismo) y
 * las solo internas.
 * Una sección que la plantilla ocultó (`ocultaPorLaPlantilla`) se ofrece: está, pero la persona no la ve como suya. Una
 * que ocultó una persona no: la vuelve a mostrar su ojo.
 */
export function seccionesAgregables(
  catalogo: ReadonlyArray<{ key: string; nombre: string; tip: string | null; agentGenerated: boolean; ctxDriven: boolean; estructural: boolean }>,
  filas: ReadonlyArray<{ key: string }>,
  sections: unknown,
): SeccionAgregable[] {
  const existe = new Set(filas.map((f) => f.key));
  const porLaPlantilla = new Set(
    parseSectionEntries(sections)
      .filter((e) => e.hidden === true && e.ocultaPorLaPlantilla === true)
      .map((e) => e.key),
  );
  return catalogo
    // Lo solo interno (el Brief traído de la hoja) tampoco: se llena importando la hoja, no a mano ni con la IA.
    .filter((s) => !s.estructural && !s.ctxDriven && !SECCIONES_SOLO_INTERNAS.has(s.key) && (!existe.has(s.key) || porLaPlantilla.has(s.key)))
    .map((s) => ({
      key: s.key,
      nombre: s.nombre,
      tip: s.tip,
      laEscribeLaIa: s.agentGenerated,
      ocultaPorLaPlantilla: existe.has(s.key),
    }));
}

/**
 * Dónde entra una sección del catálogo: después de la última sección del documento que el canon pone antes que ella, y
 * nunca después del cierre. Devuelve el índice en el orden vivo (`existentes`, en su orden) donde se inserta.
 */
export function lugarDeLaNueva(canon: readonly string[], existentes: readonly string[], nueva: string, cierre?: string | null): number {
  const suLugar = canon.indexOf(nueva);
  let despuesDe = -1;
  existentes.forEach((k, i) => {
    const j = canon.indexOf(k);
    if (k !== cierre && j !== -1 && suLugar !== -1 && j < suLugar) despuesDe = i;
  });
  if (despuesDe !== -1) return despuesDe + 1;
  // Ninguna del canon antes que ella: después de la portada si la hay (la primera), si no al principio.
  if (suLugar === -1) {
    const iCierre = cierre ? existentes.indexOf(cierre) : -1;
    return iCierre === -1 ? existentes.length : iCierre;
  }
  return Math.min(1, existentes.length);
}
