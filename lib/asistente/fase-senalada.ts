/**
 * lib/asistente/fase-senalada.ts — LA NOTA DE LA FASE SEÑALADA CON «IA», LEÍDA ENTERA (E4 P1). Puro.
 *
 * El chat puede cambiar la nota de una fase (`fase.nota`), la que el cliente lee debajo del nombre.
 * `fase.nota` la REEMPLAZA entera, así que el modelo solo puede reescribir una nota que leyó entera:
 *   · la de la fase que la persona señaló con «IA»: le llega completa en ESTE turno (`bloqueDeLaFase`),
 *     hasta `NOTA_DE_FASE_MAX` (el tope de lectura es el de escritura);
 *   · o la de una fase que no tiene nota (no hay nada que perder).
 * Lo que no cumple no se registra, y el chat dice por qué (`notasQueNoLeyo`). Es el mismo criterio
 * que el tope de lectura de las secciones de los documentos (`topeDeLecturaChars`, turno.ts).
 *
 * ⛔ El bloque va en los MENSAJES del turno, nunca en `system` (invalidaría la caché del prefijo en
 * cada turno), y no se persiste: el mismo contrato que `bloqueDeLaSeccion`. Las notas las lee
 * `lib/timeline/propuesta-para-el-chat.ts`, el único lugar del chat que lee notas.
 */
import type { Cambio, CambioFaseCambia, CambioFaseNueva } from "@/lib/timeline/borrador";
import { NOTA_DE_FASE_MAX } from "@/lib/timeline/operaciones";
import { PREFIJO_DE_FASE } from "./alcance";

type PropuestaConCambios = { cambios: readonly Cambio[] } | null | undefined;

/** El id de la fase del chip (`fase:<id>`), o null si el chip no es una fase. */
export function faseDelChip(referida: { key: string } | null | undefined): string | null {
  if (!referida || !referida.key.startsWith(PREFIJO_DE_FASE)) return null;
  const id = referida.key.slice(PREFIJO_DE_FASE.length).trim();
  return id || null;
}

const faseNueva = (id: string, p: PropuestaConCambios) =>
  p?.cambios.find((c): c is CambioFaseNueva => c.tipo === "fase-nueva" && c.clave === id);
const cambioDeNota = (id: string, p: PropuestaConCambios) =>
  p?.cambios.find((c): c is CambioFaseCambia => c.tipo === "fase-cambia" && c.faseId === id && c.campo === "notes");
const comoNota = (v: string | number | null): string | null => (v === null ? null : String(v));

/**
 * La nota de hoy de una fase, como la ve el chat: la que trae la propuesta si la cambia (o la de una
 * fase nueva de la propuesta); si no, la viva. `undefined` = esa fase no se leyó (no es de este
 * proyecto, o no existe): el ejecutor la rechaza después.
 */
export function notaDeHoy(
  phaseId: string,
  i: { notas: ReadonlyMap<string, string | null>; propuesta?: PropuestaConCambios },
): string | null | undefined {
  const nueva = faseNueva(phaseId, i.propuesta);
  if (nueva) return nueva.fase.notes ?? null;
  const cambio = cambioDeNota(phaseId, i.propuesta);
  if (cambio) return comoNota(cambio.a);
  return i.notas.has(phaseId) ? (i.notas.get(phaseId) ?? null) : undefined;
}

/** Una nota que no entra entera se corta en el tope, y se dice. */
const hastaElTope = (s: string): string =>
  s.length > NOTA_DE_FASE_MAX
    ? `${s.slice(0, NOTA_DE_FASE_MAX)}…(sigue: es más larga de lo que puedes reescribir por chat)`
    : s;
const oSinNota = (s: string | null | undefined, vacia: string): string => (s && s.trim() ? hastaElTope(s) : vacia);

/**
 * El bloque que se pega al mensaje de ESTE turno cuando el chip es una fase. "" si no aplica.
 *
 * ⛔ La fase tiene que ser de ESTE proyecto (`fases` = `ctx.fases`) o una fase nueva de su propuesta:
 * la key llega del navegador, y nunca se busca fuera del proyecto.
 */
export function bloqueDeLaFase(i: {
  referida: { key: string } | undefined;
  /** `ctx.fases`: SOLO las fases de este proyecto. */
  fases: ReadonlyArray<{ id: string; name: string }>;
  notas: ReadonlyMap<string, string | null>;
  /** `ctx.propuesta?.borrador` (E3), o null sin propuesta. */
  propuesta?: { cambios: readonly Cambio[] } | null;
}): string {
  const id = faseDelChip(i.referida);
  if (!id) return "";
  let nombre: string;
  let deHoy: string | null;
  let propuesta: string | null | undefined;
  if (id.startsWith("n:")) {
    const c = faseNueva(id, i.propuesta);
    if (!c) return "";
    nombre = c.fase.name;
    deHoy = c.fase.notes ?? null;
  } else {
    const f = i.fases.find((x) => x.id === id);
    // Sin la fase en el proyecto, o sin su nota leída, no se afirma nada: el modelo no la leyó.
    if (!f || !i.notas.has(id)) return "";
    nombre = f.name;
    deHoy = i.notas.get(id) ?? null;
    const cambio = cambioDeNota(id, i.propuesta);
    if (cambio) propuesta = comoNota(cambio.a);
  }
  return [
    `[LA FASE QUE SEÑALÓ CON «IA»: «${nombre}» [${id}]. Su nota de hoy, la que lee el cliente:]`,
    oSinNota(deHoy, "(no tiene nota)"),
    ...(propuesta !== undefined ? ["[La nota que trae la propuesta:]", oSinNota(propuesta, "(la propuesta la quita)")] : []),
    "",
    "",
  ].join("\n");
}

/** El nombre de una fase para el motivo: la de este proyecto, la nueva de la propuesta, o su id. */
export function nombreDeLaFase(
  id: string,
  i: { fases: ReadonlyArray<{ id: string; name: string }>; propuesta?: PropuestaConCambios },
): string {
  return i.fases.find((f) => f.id === id)?.name ?? faseNueva(id, i.propuesta)?.fase.name ?? id;
}

/** Los `ref` de los `fase.crear` del lote: una fase que se crea no tiene nota que perder. */
export function refsDelLote(ops: ReadonlyArray<{ op?: unknown; ref?: unknown }>): Set<string> {
  return new Set(
    ops.flatMap((o) => (o?.op === "fase.crear" && typeof o.ref === "string" && o.ref.trim() ? [o.ref.trim()] : [])),
  );
}

/**
 * Las `fase.nota` que NO se pueden registrar: el modelo no leyó entera la nota que reemplaza. Se
 * registra si la nota de hoy es null o vacía, si la fase es un `ref` del lote, si la fase no se leyó
 * (la rechaza después el ejecutor), o si es la señalada y su nota —la viva y la de la propuesta— entra
 * entera en `NOTA_DE_FASE_MAX`.
 */
export function notasQueNoLeyo(
  ops: ReadonlyArray<{ op?: unknown; phaseId?: unknown }>,
  i: {
    /** El id de la fase del chip (`faseDelChip`), o null. */
    senalada: string | null;
    notaDeHoy: (id: string) => string | null | undefined;
    /** La nota VIVA, cuando la de hoy puede ser la de la propuesta: con la señalada, las dos tienen
     *  que haber entrado enteras. */
    notaViva?: (id: string) => string | null | undefined;
    nombre: (id: string) => string;
    refsDelLote: ReadonlySet<string>;
  },
): Array<{ indice: number; motivo: string }> {
  const fuera: Array<{ indice: number; motivo: string }> = [];
  ops.forEach((o, indice) => {
    if (o?.op !== "fase.nota") return;
    const id = typeof o.phaseId === "string" ? o.phaseId.trim() : "";
    if (!id || i.refsDelLote.has(id)) return;
    const hoy = i.notaDeHoy(id);
    if (hoy === undefined || hoy === null || !hoy.trim()) return;
    if (id === i.senalada) {
      const larga = [hoy, i.notaViva?.(id)].some((n) => typeof n === "string" && n.length > NOTA_DE_FASE_MAX);
      if (!larga) return;
      fuera.push({ indice, motivo: `la nota de «${i.nombre(id)}» pasa de ${NOTA_DE_FASE_MAX} caracteres: no la puedo reescribir entera` });
      return;
    }
    fuera.push({ indice, motivo: `no leí entera la nota de «${i.nombre(id)}»: toca «IA» en esa fase y pídemelo de nuevo` });
  });
  return fuera;
}

/** «⚠ No registré N cambio(s) de nota: …». null si no hay nada que decir. */
export function avisoDeNotasQueNoLeyo(fuera: ReadonlyArray<{ motivo: string }>): string | null {
  if (fuera.length === 0) return null;
  const cuantos = fuera.length === 1 ? "1 cambio de nota" : `${fuera.length} cambios de nota`;
  return `⚠ No registré ${cuantos}: ${[...new Set(fuera.map((x) => x.motivo))].join(" · ")}.`;
}

/**
 * ⛔ Revisión de E4 (#11): LO QUE SE REGISTRA DEL LOTE QUE EMITIÓ EL MODELO. Saca las `fase.nota` cuya
 * nota no leyó entera (`notasQueNoLeyo`, con los `ref` del mismo lote) y dice por qué. turno.ts registra
 * SOLO `registran`: con la propuesta, eso va a la prueba en seco; sin ella, a `fusionarPendientes`.
 * El orden del lote se conserva.
 */
export function notasDelLote<T>(
  opsNuevas: readonly T[],
  i: Omit<Parameters<typeof notasQueNoLeyo>[1], "refsDelLote">,
): { registran: T[]; aviso: string | null } {
  const lote = opsNuevas as ReadonlyArray<{ op?: unknown; phaseId?: unknown; ref?: unknown }>;
  const noLeidas = notasQueNoLeyo(lote, { ...i, refsDelLote: refsDelLote(lote) });
  const fuera = new Set(noLeidas.map((x) => x.indice));
  return { registran: opsNuevas.filter((_, k) => !fuera.has(k)), aviso: avisoDeNotasQueNoLeyo(noLeidas) };
}
