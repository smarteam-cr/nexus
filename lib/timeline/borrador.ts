/**
 * lib/timeline/borrador.ts — EL BORRADOR DEL CRONOGRAMA: una sola propuesta, revisada en un solo modo.
 *
 * Puro, tipado y client-safe (sin Prisma). Lo usan igual la pantalla (la barra de revisión arriba
 * del Gantt, `RevisionDeLaPropuesta.tsx`) y el servidor (POST /timeline/borrador/aplicar). ⭐ El que
 * decide es el servidor: recalcula el plan DENTRO de su transacción con esta misma función y lo
 * compara con la huella del plan que vio el CSE. Si no coincide, no escribe nada.
 *
 * ── QUÉ ES UN BORRADOR ───────────────────────────────────────────────────────
 * QUÉ cambia, no una foto del cronograma. Cada cambio trae su `desde` (cómo estaba cuando se armó)
 * y su `a` (cómo quedaría). Al aplicar, el `desde` se compara con lo VIVO:
 *   · vivo == desde → se aplica, salvo que el CSE lo haya desmarcado;
 *   · vivo == a     → ya está así (alguien lo hizo a mano): no hay nada que escribir;
 *   · otro valor    → CHOQUE: el CSE lo cambió a mano después de la propuesta. Queda EXCLUIDO, con ⚠.
 * Aplicar una propuesta nunca pisa una edición humana posterior (Elías, 2026-09-24: con una
 * propuesta abierta se puede seguir editando a mano, y lo que choca queda fuera).
 *
 * ── E1: CUATRO TIPOS, Y EL FORMATO VIEJO SE LEE, NO SE ESCRIBE ─────────────
 * Hoy solo el handoff y el paso 1 de «Regenerar todo» dejan propuestas, y las dos son de fases:
 * fecha de arranque, orden, fase nueva y fase que cambia (un cambio por CAMPO). Las dos siguen
 * guardando el formato viejo (`ProposalLike`, lib/timeline/proposal-deltas.ts). Este archivo lo
 * CONVIERTE, determinista, al borrador, y también sabe leer el formato nuevo (`borrador-v1`), que
 * nadie escribe todavía: así una vuelta atrás desde la entrega siguiente no rompe nada.
 *
 * ⚠ El formato viejo no guarda `desde`. La conversión lo fija contra una FOTO (`base`): la del
 * cronograma que la pantalla tenía cuando le llegó la propuesta. La pantalla la manda al aplicar y
 * el servidor convierte con la misma foto, así los dos arman el mismo borrador. Lo que el CSE edite
 * DESPUÉS de esa foto choca y queda fuera.
 * La foto se RECUERDA en el navegador, por proyecto, token y contenido de la propuesta (abajo,
 * «LA FOTO SE RECUERDA»): cambiar de canvas, terminar «Chequear avance» (remonta el cronograma) o
 * recargar usan la MISMA foto. Si no, una edición a mano hecha durante la revisión pasaba de ⚠ a
 * «aplica» con solo volver a entrar, y «Aplicar todo» la revertía. Lo que queda: otro navegador u
 * otra computadora toman una foto nueva. Es el límite del formato viejo y se resuelve en E2 (el
 * formato nuevo guarda el `desde` al crearse).
 * Dos cosas del handoff sí se saben sin foto, por cómo lo arma analyze (reconcile-proposal.ts):
 *   · la FECHA DE ARRANQUE solo la propone cuando el proyecto no tenía (`existente ?? kickoff`): su
 *     `desde` es siempre null, y una fecha que hoy puso una persona choca;
 *   · el TIPO de actividad lo copia tal cual de la fase existente: nunca es un cambio que proponga,
 *     así que una diferencia es una edición humana posterior y no se revierte.
 * Por eso la conversión aplicada entera da lo mismo que `apply-items` salvo en esos dos casos, y
 * los dos son a propósito (lib/timeline/borrador.test.ts, «paridad»).
 */
import {
  computeProposalDeltas,
  describeChange,
  origenDePropuesta,
  type CurrentPhaseLike,
  type MovimientoDeFase,
  type PhaseField,
  type ProposalLike,
  type ProposalPhaseLike,
} from "./proposal-deltas";
import { describeMovimiento, filasDeDetalle, movimientosPorSalto } from "./sugerencia-detalle";
import {
  computePhaseRanges,
  describeEndShift,
  endShiftDays,
  fmtFull,
  plural,
  projectedEnd,
  type ProjectedEnd,
} from "./weeks";
import { evaluarMagnitud, type MagnitudPropuesta } from "./magnitud-propuesta";

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TIPOS ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export const FORMATO_BORRADOR = "borrador-v1";

export type CampoDeFase = PhaseField;
export type ValorDeCampo = string | number | null;

/** Los campos de una fase en el orden en que se listan: lo que mueve fechas primero, el renombre al final. */
export const CAMPOS_POR_IMPACTO: readonly CampoDeFase[] = [
  "durationWeeks",
  "startWeek",
  "sessionCount",
  "activityType",
  "notes",
  "name",
];

/** Una fase del cronograma vivo (o de la foto `base`), en su orden. */
export interface FaseViva {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
}

/** El cronograma tal como está: el ancla (ISO o YYYY-MM-DD; se compara por día) y las fases en orden. */
export interface Vivo {
  ancla: string | null;
  fases: FaseViva[];
}

export interface FaseNuevaPropuesta {
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
}

export interface CambioDeAncla {
  tipo: "ancla";
  clave: "ancla";
  /** YYYY-MM-DD o null (el proyecto no tenía). */
  desde: string | null;
  a: string;
}
export interface CambioDeOrden {
  tipo: "orden";
  clave: "orden";
  /** El orden COMPLETO de las fases cuando se armó. Si hoy es otro (se reordenó, se sumó o se borró una), choca. */
  desde: string[];
  /** Las fases que la propuesta ordena, en su orden. Las que no nombra quedan detrás, en el suyo. */
  a: string[];
  motivos?: string[];
}
export interface CambioFaseNueva {
  tipo: "fase-nueva";
  clave: string;
  fase: FaseNuevaPropuesta;
  /** Detrás de qué va: el id de una fase existente, la clave de otra fase nueva, o null (al principio).
   *  Si esa otra fase nueva no se aplica, se sigue su propio `despuesDe`. */
  despuesDe: string | null;
  motivo?: string;
}
export interface CambioFaseCambia {
  tipo: "fase-cambia";
  clave: string;
  faseId: string;
  /** El nombre de la fase cuando se armó: para decir cuál era aunque la hayan borrado. */
  fase: string;
  campo: CampoDeFase;
  desde: ValorDeCampo;
  a: ValorDeCampo;
  motivo?: string;
}
export type Cambio = CambioDeAncla | CambioDeOrden | CambioFaseNueva | CambioFaseCambia;

export type OrigenDelBorrador = "handoff" | "contexto";

export interface Borrador {
  formato: typeof FORMATO_BORRADOR;
  /** Cuenta las ediciones del borrador. El formato viejo no la tiene: 0. */
  version: number;
  origen: OrigenDelBorrador;
  /** Lo que la IA notó y no se aplica solo (interno). */
  observaciones: string[];
  cambios: Cambio[];
  /** Solo al LEER un `borrador-v1`: cuántos cambios son de un tipo que esta versión no sabe aplicar. */
  desconocidos?: number;
}

export const claveDeCampo = (faseId: string, campo: CampoDeFase): string => `fase:${faseId}:${campo}`;
export const claveDeNueva = (indice: number): string => `nueva:${indice}`;

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const dia = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);
const normalizarNombre = (s: string) => s.trim().toLowerCase();
const valorDe = (f: FaseViva, campo: CampoDeFase): ValorDeCampo => {
  const v = f[campo];
  return v === undefined ? null : v;
};

// ─────────────────────────────────────────────────────────────────────────────
// ── LEER: el formato viejo (convertido) y el nuevo ───────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Lo guardado en `pendingProposal` es un borrador de estructura (el formato nuevo, o el viejo sin
 * tareas)? La propuesta del modificador («Pedir cambio con IA») trae `tasks` y NO lo es: esa vive
 * solo en la memoria de la pantalla y se revisa con su propio banner.
 */
export function esBorradorGuardado(json: unknown): boolean {
  if (!esObjeto(json)) return false;
  if (json.formato === FORMATO_BORRADOR) return true;
  return Array.isArray(json.phases) && json.phases.every((f) => esObjeto(f) && f.tasks === undefined);
}

function faseNuevaDe(p: ProposalPhaseLike): FaseNuevaPropuesta {
  return {
    name: p.name,
    durationWeeks: p.durationWeeks,
    startWeek: p.startWeek ?? null,
    sessionCount: p.sessionCount ?? null,
    notes: p.notes ?? null,
    activityType: p.activityType ?? null,
  };
}

/** Detrás de qué va la fase nueva `i`: la entrada ANTERIOR de la propuesta que existe en la foto
 *  (o que es otra fase nueva). Es el mismo recorrido hacia atrás de `buildPhaseOrder`. */
function despuesDeEnLaPropuesta(p: ProposalLike, i: number, enBase: ReadonlySet<string>): string | null {
  for (let j = i - 1; j >= 0; j--) {
    const previa = p.phases[j];
    if (!previa) continue;
    if (previa.id) {
      if (enBase.has(previa.id)) return previa.id;
      continue; // una fase que ya no existe no sirve de ancla
    }
    return claveDeNueva(j);
  }
  return null;
}

/**
 * EL FORMATO VIEJO → EL BORRADOR, contra la foto `base`. Determinista: los mismos datos dan el mismo
 * borrador, en la pantalla y en el servidor. Sale de `computeProposalDeltas` a propósito: los cambios
 * son EXACTAMENTE los que la pantalla vieja mostraba, con dos inferencias del handoff (arriba).
 * Orden de la lista (y de los números): arranque, orden, y después fase por fase en el orden de la
 * propuesta —cada campo en `CAMPOS_POR_IMPACTO`—.
 */
export function convertirPropuestaVieja(p: ProposalLike, base: Vivo): Borrador {
  const origen = origenDePropuesta(p);
  const actuales: CurrentPhaseLike[] = base.fases.map((f) => ({ ...f }));
  const deltas = computeProposalDeltas(actuales, p, base.ancla);
  const enBase = new Set(base.fases.map((f) => f.id));

  let ancla: CambioDeAncla | null = null;
  let orden: CambioDeOrden | null = null;
  const resto: Cambio[] = [];
  for (const d of deltas) {
    switch (d.kind) {
      case "SET_ANCHOR":
        // Inferencia 1: el handoff propone arranque solo cuando no había. Su «desde» es null.
        ancla = { tipo: "ancla", clave: "ancla", desde: null, a: d.to };
        break;
      case "REORDER_PHASES":
        orden = {
          tipo: "orden",
          clave: "orden",
          desde: base.fases.map((f) => f.id),
          a: [...d.ids],
          ...(d.motivos && d.motivos.length > 0 ? { motivos: [...d.motivos] } : {}),
        };
        break;
      case "ADD_PHASE":
        resto.push({
          tipo: "fase-nueva",
          clave: claveDeNueva(d.index),
          fase: faseNuevaDe(d.phase),
          despuesDe: despuesDeEnLaPropuesta(p, d.index, enBase),
          ...(d.phase.motivo ? { motivo: d.phase.motivo } : {}),
        });
        break;
      case "MODIFY_PHASE":
        for (const campo of CAMPOS_POR_IMPACTO) {
          const c = d.changes.find((x) => x.field === campo);
          if (!c) continue;
          // Inferencia 2: el handoff copia el tipo de la fase existente; nunca propone cambiarlo.
          if (campo === "activityType" && origen === "handoff") continue;
          resto.push({
            tipo: "fase-cambia",
            clave: claveDeCampo(d.phaseId, campo),
            faseId: d.phaseId,
            fase: d.name,
            campo,
            desde: c.from,
            a: c.to,
            ...(d.motivo ? { motivo: d.motivo } : {}),
          });
        }
        break;
    }
  }

  const observaciones = Array.isArray(p.observaciones)
    ? p.observaciones.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    : [];
  return {
    formato: FORMATO_BORRADOR,
    version: 0,
    origen,
    observaciones,
    cambios: [...(ancla ? [ancla] : []), ...(orden ? [orden] : []), ...resto],
  };
}

const esValor = (v: unknown): v is ValorDeCampo => v === null || typeof v === "string" || typeof v === "number";
const esCampo = (v: unknown): v is CampoDeFase => typeof v === "string" && (CAMPOS_POR_IMPACTO as readonly string[]).includes(v);
const textoOpcional = (v: unknown) => (typeof v === "string" && v.length > 0 ? { v } : null);

function leerFaseNueva(v: unknown): FaseNuevaPropuesta | null {
  if (!esObjeto(v) || typeof v.name !== "string" || typeof v.durationWeeks !== "number") return null;
  const num = (x: unknown) => (typeof x === "number" ? x : null);
  const txt = (x: unknown) => (typeof x === "string" ? x : null);
  return {
    name: v.name,
    durationWeeks: v.durationWeeks,
    startWeek: num(v.startWeek),
    sessionCount: num(v.sessionCount),
    notes: txt(v.notes),
    activityType: txt(v.activityType),
  };
}

/** Un cambio del formato nuevo, validado. null = de un tipo o forma que esta versión no conoce. */
function leerCambio(v: unknown): Cambio | null {
  if (!esObjeto(v) || typeof v.clave !== "string" || !v.clave) return null;
  const motivo = textoOpcional(v.motivo);
  switch (v.tipo) {
    case "ancla":
      if (v.clave !== "ancla" || typeof v.a !== "string" || !(v.desde === null || typeof v.desde === "string")) return null;
      return { tipo: "ancla", clave: "ancla", desde: dia(v.desde), a: v.a.slice(0, 10) };
    case "orden": {
      const ids = (x: unknown) => (Array.isArray(x) && x.every((s) => typeof s === "string") ? (x as string[]) : null);
      const desde = ids(v.desde);
      const a = ids(v.a);
      if (v.clave !== "orden" || !desde || !a) return null;
      const motivos = ids(v.motivos);
      return { tipo: "orden", clave: "orden", desde, a, ...(motivos && motivos.length > 0 ? { motivos } : {}) };
    }
    case "fase-nueva": {
      const fase = leerFaseNueva(v.fase);
      if (!fase || !(v.despuesDe === null || typeof v.despuesDe === "string")) return null;
      return { tipo: "fase-nueva", clave: v.clave, fase, despuesDe: v.despuesDe, ...(motivo ? { motivo: motivo.v } : {}) };
    }
    case "fase-cambia":
      if (typeof v.faseId !== "string" || typeof v.fase !== "string" || !esCampo(v.campo)) return null;
      if (!esValor(v.desde) || !esValor(v.a)) return null;
      return {
        tipo: "fase-cambia",
        clave: v.clave,
        faseId: v.faseId,
        fase: v.fase,
        campo: v.campo,
        desde: v.desde,
        a: v.a,
        ...(motivo ? { motivo: motivo.v } : {}),
      };
    default:
      return null;
  }
}

/**
 * Lo guardado en `pendingProposal` como borrador, o null si no hay (o es la propuesta del
 * modificador, que trae tareas). El formato nuevo se lee tal cual; el viejo se convierte contra `base`.
 */
export function leerBorrador(json: unknown, base: Vivo): Borrador | null {
  if (!esObjeto(json)) return null;
  if (json.formato === FORMATO_BORRADOR) {
    const crudos = Array.isArray(json.cambios) ? json.cambios : [];
    const cambios: Cambio[] = [];
    let desconocidos = 0;
    for (const c of crudos) {
      const leido = leerCambio(c);
      if (leido) cambios.push(leido);
      else desconocidos++;
    }
    const observaciones = Array.isArray(json.observaciones)
      ? json.observaciones.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : [];
    return {
      formato: FORMATO_BORRADOR,
      version: typeof json.version === "number" && Number.isInteger(json.version) && json.version >= 0 ? json.version : 0,
      origen: json.origen === "contexto" ? "contexto" : "handoff",
      observaciones,
      cambios,
      ...(desconocidos > 0 ? { desconocidos } : {}),
    };
  }
  if (!esBorradorGuardado(json)) return null;
  return convertirPropuestaVieja(json as unknown as ProposalLike, base);
}

/**
 * La foto que manda la pantalla al aplicar, validada. null = no vino o no tiene forma de foto (el
 * servidor usa entonces lo vivo: sin foto no hay choques que detectar, y la huella decide).
 */
export function leerFoto(json: unknown): Vivo | null {
  if (!esObjeto(json) || !Array.isArray(json.fases) || json.fases.length > 500) return null;
  if (!(json.ancla === null || typeof json.ancla === "string")) return null;
  const fases: FaseViva[] = [];
  for (const f of json.fases) {
    if (!esObjeto(f) || typeof f.id !== "string" || typeof f.name !== "string" || typeof f.durationWeeks !== "number") return null;
    const num = (x: unknown) => (typeof x === "number" ? x : x === null || x === undefined ? null : undefined);
    const txt = (x: unknown) => (typeof x === "string" ? x : x === null || x === undefined ? null : undefined);
    const startWeek = num(f.startWeek);
    const sessionCount = num(f.sessionCount);
    const notes = txt(f.notes);
    const activityType = txt(f.activityType);
    if (startWeek === undefined || sessionCount === undefined || notes === undefined || activityType === undefined) return null;
    fases.push({ id: f.id, name: f.name, durationWeeks: f.durationWeeks, startWeek, sessionCount, notes, activityType });
  }
  return { ancla: dia(json.ancla), fases };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PLAN: qué se aplica, qué queda fuera y por qué ────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 *  · `aplica`   — se escribe al aplicar;
 *  · `excluido` — el CSE lo desmarcó (viaja en `sin`);
 *  · `choque`   — lo vivo no es el `desde`: alguien lo cambió después de la propuesta. Queda fuera;
 *  · `ya-esta`  — lo vivo ya es el `a`: no hay nada que escribir.
 */
export type EstadoDelCambio = "aplica" | "excluido" | "choque" | "ya-esta";

export interface ItemDelPlan {
  /** 1..M, de corrido y sin subítems. Sale del orden del borrador: no cambia al marcar ni al editar. */
  numero: number;
  cambio: Cambio;
  estado: EstadoDelCambio;
  /** Por qué choca, en palabras del CSE. Solo en `choque`. */
  choque?: string;
}

export type Lugar = { tipo: "existente"; id: string } | { tipo: "nueva"; clave: string };

export interface EscriturasDeEstructura {
  /** YYYY-MM-DD a escribir, o null = no se toca el arranque. */
  ancla: string | null;
  /** Solo los campos que cambian, por fase. */
  fases: Array<{ id: string; campos: Partial<Record<CampoDeFase, ValorDeCampo>> }>;
  nuevas: Array<{ clave: string; fase: FaseNuevaPropuesta }>;
  /** El orden final: las existentes y las nuevas. El escritor toca solo las filas cuyo orden cambia. */
  orden: Lugar[];
}

export interface PlanDeAplicacion {
  items: ItemDelPlan[];
  aplicadas: Cambio[];
  /** N: los que se van a escribir. */
  marcadas: number;
  /** Los que el CSE puede marcar (`aplica` + `excluido`): lo que «Aplicar todo» aplica. Un choque
   *  no cuenta: nunca se aplica, así que no puede faltar para que sea «todo». */
  aplicables: number;
  /** Los que todavía difieren de lo vivo (todos menos los `ya-esta`), choques incluidos. */
  total: number;
  choques: number;
  huella: string;
  escrituras: EscriturasDeEstructura;
  /** Si no se puede aplicar entero, por qué (un borrador de una versión más nueva). null = se puede. */
  bloqueo: string | null;
}

const CHOQUE_CAMPO = "Lo cambiaste a mano después de la propuesta: queda como lo dejaste.";
const CHOQUE_FASE_BORRADA = "La fase ya no está en el cronograma: este cambio queda fuera.";
const CHOQUE_ANCLA_FIJADA = "La fecha de arranque ya la fijaste a mano: queda como está.";
const CHOQUE_ANCLA_CAMBIADA = "Cambiaste la fecha de arranque después de la propuesta: queda como la dejaste.";
const CHOQUE_ORDEN =
  "Cambiaste las fases a mano después de la propuesta (el orden, o sumaste o borraste una): el orden queda como lo dejaste.";
const CHOQUE_ANCLA_DE_LA_NUEVA = "La fase después de la que iba ya no está: esta fase nueva queda fuera.";
const choqueNombreRepetido = (nombre: string) => `Ya hay una fase «${nombre}» en el cronograma: no se crea otra.`;
export const BLOQUEO_VERSION_NUEVA =
  "Esta propuesta tiene cambios que esta versión de Nexus no sabe aplicar: recarga la página.";
/** El 409 del PUT con motivo mientras hay una propuesta abierta (timeline/route.ts): lo muestran la
 *  pantalla y el chat tal cual, así que habla de la barra que el CSE tiene enfrente. */
export const MENSAJE_PROPUESTA_ABIERTA =
  "Hay una propuesta de cambios de fases sin decidir (arriba del Gantt): aplícala o descártala antes de guardar este cambio.";

/** El orden resultante con el cambio de orden aplicado sobre `ids`: primero las que nombra, después el resto. */
function ordenConCambio(ids: readonly string[], c: CambioDeOrden): string[] {
  const hay = new Set(ids);
  const nombradas = c.a.filter((id) => hay.has(id));
  const set = new Set(nombradas);
  return [...nombradas, ...ids.filter((id) => !set.has(id))];
}

const mismaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** El id de fase existente al que termina anclada una fase nueva (siguiendo las nuevas), o null. */
function idDeAnclaje(c: CambioFaseNueva, nuevas: ReadonlyMap<string, CambioFaseNueva>): string | null | undefined {
  const vistos = new Set<string>();
  let actual = c.despuesDe;
  while (actual !== null) {
    if (vistos.has(actual)) return undefined; // un ciclo (solo en un borrador roto): no se sabe dónde va
    vistos.add(actual);
    const nueva = nuevas.get(actual);
    if (!nueva) return actual;
    actual = nueva.despuesDe;
  }
  return null;
}

type Evaluacion = { estado: "pendiente" } | { estado: "ya-esta" } | { estado: "choque"; choque: string };

function evaluar(c: Cambio, vivo: Vivo, nuevas: ReadonlyMap<string, CambioFaseNueva>): Evaluacion {
  switch (c.tipo) {
    case "ancla": {
      const hoy = dia(vivo.ancla);
      if (hoy === c.a) return { estado: "ya-esta" };
      if (hoy !== c.desde) return { estado: "choque", choque: c.desde === null ? CHOQUE_ANCLA_FIJADA : CHOQUE_ANCLA_CAMBIADA };
      return { estado: "pendiente" };
    }
    case "orden": {
      const ids = vivo.fases.map((f) => f.id);
      /* «Ya está así» mira solo las fases que había: una que el CSE sumó a mano después no hace que
         el orden pedido deje de estar cumplido. Para APLICARLO, en cambio, lo vivo tiene que ser
         exactamente la foto (si no, choca). */
      const enLaFoto = new Set(c.desde);
      if (mismaLista(ids.filter((id) => enLaFoto.has(id)), ordenConCambio(c.desde, c))) return { estado: "ya-esta" };
      if (!mismaLista(ids, c.desde)) return { estado: "choque", choque: CHOQUE_ORDEN };
      return { estado: "pendiente" };
    }
    case "fase-nueva": {
      const nombre = normalizarNombre(c.fase.name);
      if (vivo.fases.some((f) => normalizarNombre(f.name) === nombre)) {
        return { estado: "choque", choque: choqueNombreRepetido(c.fase.name) };
      }
      const anclaje = idDeAnclaje(c, nuevas);
      if (anclaje === undefined || (anclaje !== null && !vivo.fases.some((f) => f.id === anclaje))) {
        return { estado: "choque", choque: CHOQUE_ANCLA_DE_LA_NUEVA };
      }
      return { estado: "pendiente" };
    }
    case "fase-cambia": {
      const f = vivo.fases.find((x) => x.id === c.faseId);
      if (!f) return { estado: "choque", choque: CHOQUE_FASE_BORRADA };
      const hoy = valorDe(f, c.campo);
      if (hoy === c.a) return { estado: "ya-esta" };
      if (hoy !== c.desde) return { estado: "choque", choque: CHOQUE_CAMPO };
      return { estado: "pendiente" };
    }
  }
}

/** El orden final: el cambio de orden (si se aplica) y las fases nuevas en su lugar. Es `buildPhaseOrder`. */
function ordenFinal(vivo: Vivo, aplicadas: readonly Cambio[], nuevasPorClave: ReadonlyMap<string, CambioFaseNueva>): Lugar[] {
  const ids = vivo.fases.map((f) => f.id);
  const orden = aplicadas.find((c): c is CambioDeOrden => c.tipo === "orden");
  const lugares: Lugar[] = (orden ? ordenConCambio(ids, orden) : ids).map((id) => ({ tipo: "existente", id }));
  for (const n of aplicadas) {
    if (n.tipo !== "fase-nueva") continue;
    let pos = 0;
    let ancla = n.despuesDe;
    const vistos = new Set<string>();
    while (ancla !== null && !vistos.has(ancla)) {
      vistos.add(ancla);
      const buscado = ancla;
      const at = lugares.findIndex((l) => (l.tipo === "existente" ? l.id === buscado : l.clave === buscado));
      if (at >= 0) {
        pos = at + 1;
        break;
      }
      ancla = nuevasPorClave.get(buscado)?.despuesDe ?? null;
    }
    lugares.splice(pos, 0, { tipo: "nueva", clave: n.clave });
  }
  return lugares;
}

/** Lo que dice el cambio que quiere, para la huella. */
function destinoDe(c: Cambio): unknown {
  switch (c.tipo) {
    case "ancla":
      return c.a;
    case "orden":
      return c.a;
    case "fase-nueva":
      return [c.fase, c.despuesDe];
    case "fase-cambia":
      return c.a;
  }
}

/** Hash de 53 bits (cyrb53), en hex. Determinista y sin dependencias: corre igual en la pantalla y en el servidor. */
export function huellaDeTexto(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * ⭐ LA FUNCIÓN QUE DECIDE. Arma la lista numerada (con el estado de cada cambio), lo que se va a
 * escribir y la huella. La pantalla la llama para pintar; el servidor, dentro de la transacción,
 * para escribir: si su huella no es la que vio el CSE, no escribe nada (409 PLAN_CAMBIO).
 * La huella cubre número, clave, estado y destino de CADA cambio: un choque que apareció en el medio
 * (otra pestaña editó) cambia la lista, y aplicar otra lista es justo lo que no puede pasar.
 */
export function planDeAplicacion(vivo: Vivo, borrador: Borrador, sin: Iterable<string> = []): PlanDeAplicacion {
  const fuera = new Set(sin);
  const nuevas = new Map(
    borrador.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva").map((c) => [c.clave, c]),
  );
  const items: ItemDelPlan[] = borrador.cambios.map((cambio, i) => {
    const ev = evaluar(cambio, vivo, nuevas);
    if (ev.estado === "choque") return { numero: i + 1, cambio, estado: "choque", choque: ev.choque };
    if (ev.estado === "ya-esta") return { numero: i + 1, cambio, estado: "ya-esta" };
    return { numero: i + 1, cambio, estado: fuera.has(cambio.clave) ? "excluido" : "aplica" };
  });
  const aplicadas = items.filter((it) => it.estado === "aplica").map((it) => it.cambio);

  const porFase = new Map<string, Partial<Record<CampoDeFase, ValorDeCampo>>>();
  for (const c of aplicadas) {
    if (c.tipo !== "fase-cambia") continue;
    const campos = porFase.get(c.faseId) ?? {};
    campos[c.campo] = c.a;
    porFase.set(c.faseId, campos);
  }
  const ancla = aplicadas.find((c): c is CambioDeAncla => c.tipo === "ancla");
  const escrituras: EscriturasDeEstructura = {
    ancla: ancla ? ancla.a : null,
    // En el orden del cronograma vivo: el mismo orden de escritura en la pantalla y en el servidor.
    fases: vivo.fases.filter((f) => porFase.has(f.id)).map((f) => ({ id: f.id, campos: porFase.get(f.id)! })),
    nuevas: aplicadas
      .filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva")
      .map((c) => ({ clave: c.clave, fase: c.fase })),
    orden: ordenFinal(vivo, aplicadas, nuevas),
  };

  const huella = huellaDeTexto(
    JSON.stringify(items.map((it) => [it.numero, it.cambio.clave, it.estado, destinoDe(it.cambio)])),
  );
  return {
    items,
    aplicadas,
    marcadas: aplicadas.length,
    aplicables: items.filter((it) => it.estado === "aplica" || it.estado === "excluido").length,
    total: items.filter((it) => it.estado !== "ya-esta").length,
    choques: items.filter((it) => it.estado === "choque").length,
    huella,
    escrituras,
    bloqueo: borrador.desconocidos && borrador.desconocidos > 0 ? BLOQUEO_VERSION_NUEVA : null,
  };
}

/**
 * «Un borrador con 0 cambios vivos se descarta solo» (Canvas, desde la Tanda M): si TODO lo que
 * propone ya está así (una propuesta vieja, o el CSE igualó el cronograma a mano), no hay nada que
 * decidir. ⚠ Un choque NO cuenta como «ya está»: el CSE tiene que ver el ⚠ y descartarlo él.
 */
export function debeDescartarseSolo(plan: {
  bloqueo: string | null;
  items: ReadonlyArray<{ estado: EstadoDelCambio }>;
}): boolean {
  return plan.bloqueo === null && plan.items.every((it) => it.estado === "ya-esta");
}

// ─────────────────────────────────────────────────────────────────────────────
// ── PROYECTAR: cómo quedaría el cronograma (solo lectura) ────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** La marca sutil de una fila: el tono del token y las etiquetas cortas («nueva», «+1 semana», «movida»…). */
export interface MarcaDeFase {
  tono: "nueva" | "cambia";
  etiquetas: string[];
}

export interface FaseProyectada extends FaseNuevaPropuesta {
  /** El id de la fase existente, o la clave de la nueva (`nueva:<i>`): lo que identifica la fila. */
  clave: string;
  id: string | null;
  marca: MarcaDeFase | null;
}

export interface Proyeccion {
  ancla: string | null;
  fases: FaseProyectada[];
}

/** Las fases que cambian de lugar RELATIVO: las que no están en la subsecuencia creciente más larga. */
function fasesMovidas(antes: readonly string[], despues: readonly string[]): Set<string> {
  const pos = new Map(antes.map((id, i) => [id, i]));
  const seq = despues.filter((id) => pos.has(id));
  const n = seq.length;
  const largo = new Array<number>(n).fill(1);
  const previo = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (pos.get(seq[j])! < pos.get(seq[i])! && largo[j] + 1 > largo[i]) {
        largo[i] = largo[j] + 1;
        previo[i] = j;
      }
    }
  }
  let fin = 0;
  for (let i = 1; i < n; i++) if (largo[i] > largo[fin]) fin = i;
  const quietas = new Set<string>();
  for (let i = n > 0 ? fin : -1; i >= 0; i = previo[i]) quietas.add(seq[i]);
  return new Set(seq.filter((id) => !quietas.has(id)));
}

function etiquetaDeDuracion(desde: number, a: number): string {
  const d = a - desde;
  return `${d > 0 ? "+" : "−"}${plural(Math.abs(d), "semana", "semanas")}`;
}

/**
 * El cronograma como quedaría aplicando lo marcado: la vista «Ver la propuesta». Es SOLO LECTURA:
 * nunca pasa por el estado editable de la pantalla ni por su guardado. Sale de las MISMAS
 * escrituras que el servidor va a hacer, así la vista no puede prometer otra cosa.
 * Las tareas de una fase que se acorta caen en su última semana (la pantalla lo hace al pintar, y
 * el servidor, al escribir).
 */
export function proyectar(vivo: Vivo, borrador: Borrador, sin: Iterable<string> = []): Proyeccion {
  const plan = planDeAplicacion(vivo, borrador, sin);
  const porId = new Map(vivo.fases.map((f) => [f.id, f]));
  const campos = new Map(plan.escrituras.fases.map((f) => [f.id, f.campos]));
  const nuevas = new Map(plan.escrituras.nuevas.map((n) => [n.clave, n.fase]));
  const orden = plan.aplicadas.find((c): c is CambioDeOrden => c.tipo === "orden");
  const idsFinales = plan.escrituras.orden.flatMap((l) => (l.tipo === "existente" ? [l.id] : []));
  const movidas = orden ? fasesMovidas(vivo.fases.map((f) => f.id), idsFinales) : new Set<string>();

  const fases: FaseProyectada[] = plan.escrituras.orden.map((l) => {
    if (l.tipo === "nueva") {
      const f = nuevas.get(l.clave)!;
      return { ...f, clave: l.clave, id: null, marca: { tono: "nueva", etiquetas: ["nueva"] } };
    }
    const actual = porId.get(l.id)!;
    const cambios = campos.get(l.id) ?? {};
    const f: FaseNuevaPropuesta = {
      name: actual.name,
      durationWeeks: actual.durationWeeks,
      startWeek: actual.startWeek,
      sessionCount: actual.sessionCount,
      notes: actual.notes,
      activityType: actual.activityType,
    };
    for (const campo of CAMPOS_POR_IMPACTO) {
      if (!(campo in cambios)) continue;
      const v = cambios[campo] ?? null;
      if (campo === "name") f.name = String(v);
      else if (campo === "durationWeeks") f.durationWeeks = Number(v);
      else if (campo === "startWeek") f.startWeek = v === null ? null : Number(v);
      else if (campo === "sessionCount") f.sessionCount = v === null ? null : Number(v);
      else if (campo === "notes") f.notes = v === null ? null : String(v);
      else f.activityType = v === null ? null : String(v);
    }
    return { ...f, clave: l.id, id: l.id, marca: null };
  });

  // Las etiquetas del inicio necesitan las dos grillas: dónde arranca hoy y dónde arrancaría.
  const rangosHoy = computePhaseRanges(vivo.fases);
  const inicioHoy = new Map(vivo.fases.map((f, i) => [f.id, rangosHoy[i].start]));
  const rangosDespues = computePhaseRanges(fases);
  fases.forEach((f, i) => {
    if (f.id === null) return;
    const actual = porId.get(f.id)!;
    const cambios = campos.get(f.id) ?? {};
    const etiquetas: string[] = [];
    for (const campo of CAMPOS_POR_IMPACTO) {
      if (!(campo in cambios)) continue;
      if (campo === "durationWeeks") etiquetas.push(etiquetaDeDuracion(actual.durationWeeks, f.durationWeeks));
      else if (campo === "startWeek") {
        const de = (inicioHoy.get(f.id) ?? 0) + 1;
        const a = rangosDespues[i].start + 1;
        etiquetas.push(de === a ? (f.startWeek === null ? "inicio tras la anterior" : `inicio fijo en S${a}`) : `inicio S${de} → S${a}`);
      } else if (campo === "name") etiquetas.push("renombrada");
      else if (campo === "sessionCount") etiquetas.push("sesiones");
      else if (campo === "notes") etiquetas.push("notas");
      else etiquetas.push("tipo");
    }
    if (movidas.has(f.id)) etiquetas.push("movida");
    if (etiquetas.length > 0) f.marca = { tono: "cambia", etiquetas };
  });

  return { ancla: plan.escrituras.ancla ?? dia(vivo.ancla), fases };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── RESUMIR: la lista numerada, el cierre antes → después y la magnitud ──────
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemDeLaLista {
  numero: number;
  clave: string;
  estado: EstadoDelCambio;
  /** «Pruebas · 3 → 4 semanas», «Fase nueva «Piloto» · 2 semanas · va después de «Pruebas»». */
  titulo: string;
  /** El antes → después legible de un cambio de campo (notas, tipo, nombre…). */
  detalle: Array<{ etiqueta: string; antes: string; despues: string }>;
  /** Por qué lo propone la IA (interno: cita la reunión o la nota). */
  motivo?: string;
  /** El ⚠ del choque, o «Ya está así.». */
  aviso?: string;
}

export interface ResumenDelBorrador {
  origen: OrigenDelBorrador;
  observaciones: string[];
  items: ItemDeLaLista[];
  marcadas: number;
  /** Lo que se puede marcar: `marcadas === aplicables` es «Aplicar todo», con choques o sin ellos. */
  aplicables: number;
  total: number;
  choques: number;
  huella: string;
  bloqueo: string | null;
  cierreAntes: ProjectedEnd;
  cierreDespues: ProjectedEnd;
  /** «El cierre se corre 2 semanas: … → ….», con lo marcado. null si no hay fechas. */
  corrimiento: string | null;
  /** Cuán distinta es la propuesta ENTERA (lo que se puede aplicar): el aviso de «otro cronograma». */
  magnitud: MagnitudPropuesta;
  /** Cuán distinto es lo MARCADO, que es lo que el botón va a escribir: decide la confirmación. */
  magnitudDeLoMarcado: MagnitudPropuesta;
}

function nombreDeFase(vivo: Vivo, id: string, respaldo: string): string {
  return vivo.fases.find((f) => f.id === id)?.name ?? respaldo;
}

function movimientosDe(antes: readonly string[], despues: readonly string[], vivo: Vivo): MovimientoDeFase[] {
  const puesto = new Map(antes.map((id, i) => [id, i + 1]));
  const out: MovimientoDeFase[] = [];
  despues.forEach((id, i) => {
    const de = puesto.get(id);
    if (de === undefined || de === i + 1) return;
    out.push({ id, nombre: nombreDeFase(vivo, id, id), de, a: i + 1 });
  });
  return out;
}

function tituloDe(c: Cambio, vivo: Vivo, nuevas: ReadonlyMap<string, CambioFaseNueva>): string {
  switch (c.tipo) {
    case "ancla": {
      const hoy = dia(vivo.ancla);
      return `Fecha de arranque: ${hoy ? fmtFull(hoy) : "sin fecha"} → ${fmtFull(c.a)}`;
    }
    case "orden": {
      const movs = movimientosPorSalto(movimientosDe(c.desde, ordenConCambio(c.desde, c), vivo));
      const primeros = movs.slice(0, 3).map(describeMovimiento).join(" · ");
      const mas = movs.length > 3 ? ` · y ${plural(movs.length - 3, "fase más", "fases más")}` : "";
      return `Reordenar las fases: ${primeros || "otro orden"}${mas}`;
    }
    case "fase-nueva": {
      const sesiones = c.fase.sessionCount != null ? ` · ${plural(c.fase.sessionCount, "sesión", "sesiones")}` : "";
      let donde = " · va al principio";
      if (c.despuesDe !== null) {
        const previa = nuevas.get(c.despuesDe);
        const nombre = previa ? previa.fase.name : nombreDeFase(vivo, c.despuesDe, c.despuesDe);
        donde = ` · va después de «${nombre}»`;
      }
      return `Fase nueva «${c.fase.name}» · ${plural(c.fase.durationWeeks, "semana", "semanas")}${sesiones}${donde}`;
    }
    case "fase-cambia": {
      const nombre = nombreDeFase(vivo, c.faseId, c.fase);
      const rangos = computePhaseRanges(vivo.fases);
      const i = vivo.fases.findIndex((f) => f.id === c.faseId);
      const inicioActual = i >= 0 ? rangos[i].start : null;
      /* El nombre y el tipo, en palabras: `describeChange` dice «renombrar a…» (una orden, en una
         lista que describe) y el tipo con el código crudo del enum. El detalle da el antes → después. */
      const texto =
        c.campo === "name"
          ? `pasa a llamarse «${String(c.a)}» (conserva sus tareas)`
          : c.campo === "activityType"
            ? "cambia de tipo"
            : describeChange({ field: c.campo, from: c.desde, to: c.a }, { inicioActual });
      return `${nombre} · ${texto}`;
    }
  }
}

/**
 * Lo que pinta la barra de revisión, con lo marcado (`sin` = lo desmarcado). La magnitud mide la
 * propuesta ENTERA —todo lo que se puede aplicar—, igual que la franja de antes: es la que decide
 * si «Aplicar todo» pide confirmación.
 */
export function resumir(vivo: Vivo, borrador: Borrador, sin: Iterable<string> = []): ResumenDelBorrador {
  const sinLista = [...sin];
  const plan = planDeAplicacion(vivo, borrador, sinLista);
  const nuevas = new Map(
    borrador.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva").map((c) => [c.clave, c]),
  );
  const items: ItemDeLaLista[] = plan.items.map((it) => {
    const c = it.cambio;
    const detalle =
      c.tipo === "fase-cambia" && (c.campo === "notes" || c.campo === "activityType" || c.campo === "name")
        ? filasDeDetalle([{ field: c.campo, from: c.desde, to: c.a }]).map((f) => ({
            etiqueta: f.etiqueta,
            antes: f.antes,
            despues: f.despues,
          }))
        : [];
    const motivo = c.tipo === "orden" ? c.motivos?.join(" · ") : c.tipo === "ancla" ? undefined : c.motivo;
    const aviso = it.estado === "choque" ? `⚠ ${it.choque}` : it.estado === "ya-esta" ? "Ya está así." : undefined;
    return {
      numero: it.numero,
      clave: c.clave,
      estado: it.estado,
      titulo: tituloDe(c, vivo, nuevas),
      detalle,
      ...(motivo ? { motivo } : {}),
      ...(aviso ? { aviso } : {}),
    };
  });

  const proyeccion = proyectar(vivo, borrador, sinLista);
  const cierreAntes = projectedEnd(vivo.ancla, vivo.fases);
  const cierreDespues = projectedEnd(proyeccion.ancla, proyeccion.fases);

  /* Dos magnitudes, con la MISMA regla (`evaluarMagnitud`):
     · la de la propuesta entera —todo lo que se PUEDE aplicar, pendiente o desmarcado, como si se
       marcara todo—: el aviso de «otro cronograma» y el color de la barra;
     · la de lo MARCADO —lo que el botón va a escribir—: decide si se confirma. Antes la confirmación
       pedía «todo marcado», y con un solo choque (justo el caso de E1: el CSE editó un campo) o una
       nota desmarcada, un cronograma prácticamente nuevo se aplicaba con un clic. */
  const aplicables = plan.items.filter((it) => it.estado === "aplica" || it.estado === "excluido").map((it) => it.cambio);
  const entera = proyectar(vivo, borrador, []);
  const magnitud = magnitudDe(vivo, aplicables, cierreAntes, projectedEnd(entera.ancla, entera.fases));
  const magnitudDeLoMarcado = magnitudDe(vivo, plan.aplicadas, cierreAntes, cierreDespues);

  return {
    origen: borrador.origen,
    observaciones: borrador.observaciones,
    items,
    marcadas: plan.marcadas,
    aplicables: plan.aplicables,
    total: plan.total,
    choques: plan.choques,
    huella: plan.huella,
    bloqueo: plan.bloqueo,
    cierreAntes,
    cierreDespues,
    corrimiento: describeEndShift(cierreAntes, cierreDespues),
    magnitud,
    magnitudDeLoMarcado,
  };
}

/** La magnitud de un conjunto de cambios, contada como la cuenta la franja vieja (por FASE). */
function magnitudDe(
  vivo: Vivo,
  cambios: readonly Cambio[],
  finAntes: ProjectedEnd,
  finDespues: ProjectedEnd,
): MagnitudPropuesta {
  const fasesCon = (campo: CampoDeFase) =>
    new Set(cambios.flatMap((c) => (c.tipo === "fase-cambia" && c.campo === campo ? [c.faseId] : []))).size;
  return evaluarMagnitud({
    fasesActuales: vivo.fases.length,
    fasesRenombradas: fasesCon("name"),
    fasesConDuracionDistinta: fasesCon("durationWeeks"),
    fasesNuevas: cambios.filter((c) => c.tipo === "fase-nueva").length,
    reordena: cambios.some((c) => c.tipo === "orden"),
    mueveArranque: cambios.some((c) => c.tipo === "ancla"),
    finAntes,
    finDespues,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TEXTOS DE LA BARRA (acá y no en el componente: los prueban los tests) ─
// ─────────────────────────────────────────────────────────────────────────────

/** La línea fija de la barra: lo que pasa con el cliente mientras la propuesta espera. */
export const LINEA_DEL_CLIENTE = "El cliente sigue viendo el cronograma actual hasta que apliques.";
/** «Subir al cliente» queda libre con una propuesta abierta, con este aviso (respuesta 4 de Elías). */
export const AVISO_SUBIR_CON_PROPUESTA =
  "Hay una propuesta de cambios de fases sin aplicar (arriba del Gantt): si subes ahora, el cliente ve el cronograma sin esos cambios.";
/** El ÚNICO botón que alterna la vista: dice lo que vas a ver al apretarlo. */
export const TEXTO_VER_ANTES = "Ver como estaba antes";
export const TEXTO_VER_PROPUESTA = "Ver la propuesta";

/**
 * «Aplicar todo» si va todo lo que se puede aplicar; si no, «Aplicar N de M». M es lo que se puede
 * MARCAR (`aplicables`), no el total: un choque nunca se aplica, así que con un ⚠ en la lista el
 * botón igual dice «Aplicar todo» cuando está marcado todo lo limpio (plan §1.3: «Aplicar todo»
 * aplica solo lo limpio).
 */
export function textoDeAplicar(marcadas: number, aplicables: number): string {
  return marcadas === aplicables ? "Aplicar todo" : `Aplicar ${marcadas} de ${aplicables}`;
}

/**
 * ¿El botón tiene que pedir confirmación antes de aplicar? Sí cuando lo MARCADO es prácticamente
 * otro cronograma, marcado entero o no: la confirmación cuida lo que se escribe, no la cantidad de
 * casillas. Con un choque o una nota desmarcada, lo demás sigue siendo otro plan.
 */
export function pideConfirmacion(r: Pick<ResumenDelBorrador, "marcadas" | "magnitudDeLoMarcado">): boolean {
  return r.marcadas > 0 && r.magnitudDeLoMarcado.esCronogramaNuevo;
}

/**
 * El cierre antes → después en una frase, para la barra y la confirmación. Con un cierre FIJADO a
 * mano (Tanda K) la fecha que ven «Ver como estaba antes», «Ver la propuesta» y el cliente es la
 * fijada, y aplicar no la toca: se dice eso, y el corrimiento es el del plan calculado. Si no, el
 * «antes» de la barra era una fecha que no aparecía en ningún lado.
 */
export function fraseDelCierre(
  r: Pick<ResumenDelBorrador, "corrimiento" | "cierreAntes" | "cierreDespues">,
  cierreFijado: string | null = null,
): string {
  const antes = r.cierreAntes;
  const despues = r.cierreDespues;
  const semanas =
    antes.spanWeeks === despues.spanWeeks
      ? `el plan sigue en ${plural(despues.spanWeeks, "semana", "semanas")}`
      : `el plan pasa de ${plural(antes.spanWeeks, "semana", "semanas")} a ${plural(despues.spanWeeks, "semana", "semanas")}`;
  if (!cierreFijado) {
    if (r.corrimiento) return r.corrimiento;
    return `${semanas.charAt(0).toUpperCase()}${semanas.slice(1)} (sin fecha de arranque no hay fecha de cierre).`;
  }
  const calculado =
    antes.date && despues.date
      ? endShiftDays(antes, despues) === 0
        ? `el plan calculado sigue terminando el ${despues.label}`
        : `el plan calculado pasa de terminar el ${antes.label} a terminar el ${despues.label}`
      : semanas;
  return `El cierre está fijado a mano el ${fmtFull(cierreFijado)} y aplicar no lo cambia; ${calculado}.`;
}

/** El PUT con motivo respondió 409 PROPUESTA_ABIERTA y en pantalla está la vista previa del
 *  modificador: la propuesta guardada entró mientras la IA trabajaba (otra pantalla regeneró) y no
 *  hay barra que la muestre. Se dice qué hacer, sin tirar el resultado de la IA sin preguntar. */
export const AVISO_PROPUESTA_ABIERTA_CON_VISTA_PREVIA =
  "Mientras la IA trabajaba entró una propuesta de cambios de fases que nadie decidió todavía, y no se aplica nada encima de ella. Descarta esta vista previa para verla arriba del Gantt; cuando la resuelvas, vuelve a pedir el cambio.";

// ─────────────────────────────────────────────────────────────────────────────
// ── EL ESTADO DE LA REVISIÓN EN PANTALLA (puro, lo usa el hook) ──────────────
// ─────────────────────────────────────────────────────────────────────────────

export type VistaDelBorrador = "propuesta" | "antes";

/**
 * Lo que la pantalla recuerda de UNA propuesta: la foto contra la que se convirtió, lo desmarcado
 * (en memoria: viaja como `sin` al aplicar) y qué vista está mirando. `clave` identifica la
 * propuesta (su token y su contenido): si cambia, todo vuelve a empezar.
 */
export interface EstadoDeRevision {
  clave: string | null;
  base: Vivo | null;
  sin: ReadonlySet<string>;
  vista: VistaDelBorrador;
}

export const REVISION_VACIA: EstadoDeRevision = { clave: null, base: null, sin: new Set(), vista: "propuesta" };

/** La identidad de lo que hay guardado: token + contenido. null si no es un borrador. */
export function claveDeRevision(json: unknown, token: string | null): string | null {
  if (!esBorradorGuardado(json)) return null;
  return `${token ?? ""}|${huellaDeTexto(JSON.stringify(json))}`;
}

/**
 * Una propuesta distinta: se mira la propuesta, con la foto y lo desmarcado que se recuerden de ESA
 * misma propuesta (volver a entrar o recargar), o con la foto de este momento y nada desmarcado.
 */
export function revisionPara(clave: string | null, vivo: Vivo, recuerdo: RecuerdoDeLaRevision | null = null): EstadoDeRevision {
  if (clave === null) return REVISION_VACIA;
  return recuerdo
    ? { clave, base: recuerdo.foto, sin: new Set(recuerdo.sin), vista: "propuesta" }
    : { clave, base: vivo, sin: new Set(), vista: "propuesta" };
}

export function alternarVista(e: EstadoDeRevision): EstadoDeRevision {
  return { ...e, vista: e.vista === "propuesta" ? "antes" : "propuesta" };
}

export function marcarCambio(e: EstadoDeRevision, clave: string, incluir: boolean): EstadoDeRevision {
  const sin = new Set(e.sin);
  if (incluir) sin.delete(clave);
  else sin.add(clave);
  return { ...e, sin };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA FOTO SE RECUERDA (en el navegador, nunca en el servidor) ──────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// El cronograma se DESMONTA al cambiar de canvas (Handoff, Kickoff…) y se remonta al terminar
// «Chequear avance»; recargar también empieza de cero. Si la foto viviera solo en el estado del
// componente, al volver se tomaba una foto NUEVA del cronograma ya editado: la edición a mano pasaba
// de ⚠ a «aplica», marcada, y «Aplicar todo» la revertía (revisión de E1, 2026-09-24).
// Por eso la foto (y lo desmarcado) se recuerdan por PROYECTO, atados a la identidad de la
// propuesta —token + contenido (`claveDeRevision`)—: una propuesta distinta, aunque tenga el mismo
// contenido, arranca con su propia foto. Una sola entrada por proyecto: la propuesta nueva pisa la
// vieja, y aplicar o descartar la borra. Nada de esto viaja al servidor ni cambia el formato
// guardado (E1 no escribe el formato nuevo): es memoria de la pantalla que sobrevive al remonte.

/** Lo mínimo de `Storage` que usa la pantalla: `localStorage` en el navegador, un Map en los tests. */
export interface AlmacenDeFotos {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** Lo que se recuerda de una propuesta: la foto contra la que se convirtió y lo desmarcado. */
export interface RecuerdoDeLaRevision {
  foto: Vivo;
  sin: string[];
}

/** Un almacén que vive lo que viva el módulo: sobrevive al remonte del canvas aunque el navegador
 *  no deje usar `localStorage` (modo privado, sitio bloqueado). Los tests lo usan de doble. */
export function almacenEnMemoria(): AlmacenDeFotos {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** Dónde vive la foto de la propuesta abierta de un proyecto: UNA entrada por proyecto. */
export const claveDeLaFoto = (projectId: string): string => `nexus:cronograma:foto-de-la-propuesta:${projectId}`;

/**
 * La foto (y lo desmarcado) recordados para ESA propuesta (`revision` = `claveDeRevision`), o null:
 * no hay, es de otra propuesta, está rota o el navegador no deja leer. Nunca tira: sin recuerdo, la
 * pantalla toma la foto de ahora, que es lo que hacía antes.
 */
export function recuerdoDeLaRevision(
  almacen: AlmacenDeFotos | null,
  projectId: string,
  revision: string,
): RecuerdoDeLaRevision | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(claveDeLaFoto(projectId));
    if (!crudo) return null;
    const json: unknown = JSON.parse(crudo);
    if (!esObjeto(json) || json.revision !== revision) return null;
    const foto = leerFoto(json.foto);
    if (!foto) return null;
    const sin = Array.isArray(json.sin) ? json.sin.filter((s): s is string => typeof s === "string") : [];
    return { foto, sin };
  } catch {
    return null;
  }
}

/** Guarda la foto y lo desmarcado de esa propuesta (pisa lo de la propuesta anterior del proyecto). */
export function recordarRevision(
  almacen: AlmacenDeFotos | null,
  projectId: string,
  revision: string,
  recuerdo: RecuerdoDeLaRevision,
): void {
  if (!almacen) return;
  try {
    almacen.setItem(claveDeLaFoto(projectId), JSON.stringify({ revision, foto: recuerdo.foto, sin: recuerdo.sin }));
  } catch {
    /* sin lugar o sin permiso: la revisión sigue en memoria, como antes */
  }
}

/** La propuesta se resolvió (aplicada o descartada): su foto ya no sirve. */
export function olvidarRevision(almacen: AlmacenDeFotos | null, projectId: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(claveDeLaFoto(projectId));
  } catch {
    /* nada que hacer: la próxima propuesta la pisa */
  }
}
