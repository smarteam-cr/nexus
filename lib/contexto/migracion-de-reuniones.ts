/**
 * lib/contexto/migracion-de-reuniones.ts — QUÉ LEÍA CADA DOCUMENTO ANTES DE LA ETAPA 7 y qué se migra. PURO.
 *
 * Antes de la etapa 7 de la memoria de la cuenta, el diagnóstico, la planificación, la ejecución y la entrega leían en
 * «modo sugerido»: entraba sola toda reunión del proyecto con el cliente que nadie hubiera sacado. El kickoff y las
 * integraciones leían solo el handoff hasta el 2026-10-07 (674d9159): lo que tienen generado de antes no salió de
 * ninguna reunión. Nadie eligió nunca (0 vínculos en `true` al 2026-10-10), así que con la regla nueva —solo las
 * elegidas— cada documento quedaba en CERO reuniones al regenerarlo. DECISIONS «Los documentos leen la memoria y solo
 * las reuniones elegidas» › «La migración (2026-10-10)».
 *
 * Acá vive la regla vieja una sola vez, para los dos que la usan:
 *  · scripts/migrar-reuniones-de-los-documentos.ts: por documento con contenido, elige (`true`) las MÁS RECIENTES
 *    que leía y que tienen algo que leer, hasta `MIGRADAS_POR_DOCUMENTO` (las que el lector nuevo lee enteras), solo
 *    donde nadie decidió nada y solo una vez por documento (`MarcaDeLaMigracion`).
 *  · lib/contexto/sugerencias-del-documento.ts: las que leía y no están elegidas ni desestimadas se SUGIEREN
 *    («Reunión con el cliente en este proyecto»). Nunca escriben.
 *
 * La regla vieja es la que conserva la exploración (`linkFeedsExploracion`): agregada a mano entra, sacada no, sin tocar
 * entra si es con el cliente. Sobre la membresía del proyecto (el chokepoint, con su piso) y solo lo que ya ocurrió.
 */
import { MAX_ELEGIDAS_ENTERAS } from "./documento";
import { linkFeedsExploracion, type DestinoSoloElegidas } from "@/lib/sessions/destinos-de-contexto";
import { yaOcurrio } from "@/lib/sessions/ocurridas";

/** Lo mínimo de una reunión de la membresía para la regla vieja. */
export interface ReunionDeLaReglaVieja {
  id: string;
  /** ms. */
  fecha: number;
  /** ¿Fue con el cliente? (`etiquetaDeSala(...) === "CON EL CLIENTE"`). */
  conElCliente: boolean;
  /** El afinado de ESTE documento: `true` elegida, `false` desestimada o sacada, `null` sin tocar. */
  afinado: boolean | null;
  /**
   * ¿Tiene algo que leer para ESTE documento? (`tieneQueLeer`, documento.ts: transcripción, notas o minuta; en un
   * documento del cliente, la minuta revisada). `undefined` = no se sabe (las sugerencias no lo miran): cuenta como sí.
   */
  tieneQueLeer?: boolean;
}

/**
 * Cuántas se eligen por documento: las que el lector nuevo lee ENTERAS (`MAX_ELEGIDAS_ENTERAS`). Más no mejora el
 * documento (las demás irían en resumen) y cada una que se elige le pone el candado a su reunión: el tope acota eso.
 */
export const MIGRADAS_POR_DOCUMENTO = MAX_ELEGIDAS_ENTERAS;

/**
 * DESDE CUÁNDO LEE REUNIONES cada documento (ISO). El kickoff y las integraciones leían solo el handoff hasta el
 * 2026-10-07 (674d9159, «contexto adicional: cada documento del proyecto guarda lo suyo»): un kickoff generado antes no
 * llevaba ninguna reunión, así que migrarle 6 no es «lo que llevaba», es contenido nuevo. Los demás leían en modo
 * sugerido desde antes: sin fecha.
 */
export const DESDE_QUE_LEE_REUNIONES: Partial<Record<DestinoSoloElegidas, string>> = {
  kickoff: "2026-10-07T18:55:10.000Z",
  integraciones: "2026-10-07T18:55:10.000Z",
};

/**
 * ¿El documento leía reuniones cuando se generó por última vez? Puro. `ultimaGeneracion` (ms) = el bloque más nuevo
 * escrito por la IA. Sin fecha conocida en un documento con fecha de corte: no.
 */
export function leiaReunionesAlGenerarse(destino: DestinoSoloElegidas, ultimaGeneracion: number | null): boolean {
  const desde = DESDE_QUE_LEE_REUNIONES[destino];
  if (!desde) return true;
  return ultimaGeneracion !== null && ultimaGeneracion >= Date.parse(desde);
}

/** ¿El documento la leía con la regla de antes de la etapa 7? */
export function leiaConLaReglaVieja(r: ReunionDeLaReglaVieja, ahora: number): boolean {
  return yaOcurrio(r.fecha, ahora) && linkFeedsExploracion({ included: true, override: r.afinado }, r.conElCliente);
}

/** Las que el documento leía con la regla vieja, la más reciente primero (a igual fecha, por id: siempre el mismo orden). */
export function queLeiaConLaReglaVieja<T extends ReunionDeLaReglaVieja>(reuniones: readonly T[], ahora: number): T[] {
  return reuniones.filter((r) => leiaConLaReglaVieja(r, ahora)).sort((a, b) => b.fecha - a.fecha || a.id.localeCompare(b.id));
}

export interface PlanDelDocumento<T> {
  /** Las que leía con la regla vieja, la más reciente primero. */
  leia: T[];
  /** Las que se eligen (`true`): las más recientes que leía y tienen algo que leer, solo si nadie decidió nada. */
  aElegir: T[];
  /** Las que leía, con algo que leer, y no se eligen: quedan como sugerencia del panel. */
  paraSugerir: T[];
  /** Las que leía sin nada que leer (sin transcripción, notas ni minuta que cuente): no ocupan un lugar. */
  vacias: T[];
  /** Alguien ya eligió reuniones para este documento: no se toca nada. */
  yaTeniaElegidas: boolean;
}

/**
 * EL PLAN DE UN DOCUMENTO. Puro. Si el documento ya tiene alguna reunión elegida (`true`, también una fuera de la lista
 * por el piso del proyecto: `hayElegidasFueraDeLaLista`), una persona ya decidió qué lee y no se agrega nada. Si no, de
 * las que leía con la regla vieja y siguen sin tocar (`null`), primero se apartan las que no tienen nada que leer —como
 * hace el lector nuevo (`planDeLasElegidas`)— y se eligen las `tope` más recientes de las demás. Nunca un `false`:
 * alguien la sacó o la desestimó.
 */
export function planDelDocumento<T extends ReunionDeLaReglaVieja>(
  reuniones: readonly T[],
  ahora: number,
  o: { hayElegidasFueraDeLaLista?: boolean; tope?: number } = {},
): PlanDelDocumento<T> {
  const leia = queLeiaConLaReglaVieja(reuniones, ahora);
  const yaTeniaElegidas = !!o.hayElegidasFueraDeLaLista || reuniones.some((r) => r.afinado === true);
  if (yaTeniaElegidas) return { leia, aElegir: [], paraSugerir: [], vacias: [], yaTeniaElegidas };
  const libres = leia.filter((r) => r.afinado === null);
  const conTexto = libres.filter((r) => r.tieneQueLeer !== false);
  const vacias = libres.filter((r) => r.tieneQueLeer === false);
  const tope = Math.max(0, o.tope ?? MIGRADAS_POR_DOCUMENTO);
  return { leia, aElegir: conTexto.slice(0, tope), paraSugerir: conTexto.slice(tope), vacias, yaTeniaElegidas };
}

/**
 * LAS REUNIONES QUE DEJAN DE RECLASIFICARSE. Puro. El candado congela la reunión ENTERA, no solo el vínculo: el
 * clasificador (`reclassifyClientSessions`) saltea toda sesión con ALGÚN vínculo con candado, así que una reunión cuyos
 * vínculos estaban todos libres y que recibe un `true` ya no llega sola a un proyecto nuevo del cliente.
 * `vinculos`: TODOS los vínculos de cada reunión (de cualquier proyecto), con su candado de hoy.
 */
export function reunionesQueSeCongelan(
  vinculos: ReadonlyArray<{ id: string; sessionId: string; bloqueado: boolean }>,
  escritos: ReadonlySet<string>,
): Set<string> {
  const porReunion = new Map<string, { libres: boolean; escrita: boolean }>();
  for (const v of vinculos) {
    const r = porReunion.get(v.sessionId) ?? { libres: true, escrita: false };
    if (v.bloqueado) r.libres = false;
    if (escritos.has(v.id)) r.escrita = true;
    porReunion.set(v.sessionId, r);
  }
  return new Set([...porReunion].flatMap(([id, r]) => (r.libres && r.escrita ? [id] : [])));
}

// ── La marca: lo que ya se migró no se vuelve a migrar ─────────────────────────────────────────────────────────────

/**
 * La fila de `CronJobState` donde la migración anota qué migró (en `lastResult`). Sin ella, correrla otra vez después
 * de que una persona deshizo algo lo volvía a hacer: la X sobre una elegida escribe `null` (no `false`), y «Sacar» de
 * una sesión de la exploración no deja la reunión en `fuera`.
 */
export const MARCA_DE_LA_MIGRACION = "migrar-reuniones-de-los-documentos";

export interface MarcaDeLaMigracion {
  /** `<projectId>:<destino>` → cuándo se migró (ISO). */
  documentos: Record<string, string>;
  /** id de la exploración → cuándo se migró (ISO). */
  exploraciones: Record<string, string>;
}

export const claveDelDocumento = (projectId: string, destino: DestinoSoloElegidas) => `${projectId}:${destino}`;

/** Lee la marca guardada (tolerante: lo que no tenga forma se ignora). */
export function leerMarca(raw: unknown): MarcaDeLaMigracion {
  const registro = (x: unknown): Record<string, string> => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return {};
    return Object.fromEntries(Object.entries(x as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
  };
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { documentos: registro(o.documentos), exploraciones: registro(o.exploraciones) };
}

/** Suma a la marca lo migrado ahora. Lo que ya estaba conserva su fecha. Puro. */
export function sumarALaMarca(
  marca: MarcaDeLaMigracion,
  nuevo: { documentos?: readonly string[]; exploraciones?: readonly string[] },
  en: string,
): MarcaDeLaMigracion {
  const sumar = (r: Record<string, string>, claves: readonly string[] = []) => {
    const out = { ...r };
    for (const k of claves) if (!(k in out)) out[k] = en;
    return out;
  };
  return { documentos: sumar(marca.documentos, nuevo.documentos), exploraciones: sumar(marca.exploraciones, nuevo.exploraciones) };
}
