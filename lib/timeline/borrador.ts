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
 * formato nuevo guarda el `desde` al crearse). Desde E2b el handoff también escribe el formato nuevo
 * (`borradorDelHandoff`): la foto queda solo para las propuestas viejas que siguen abiertas.
 * Dos cosas del handoff sí se saben sin foto, por cómo lo arma analyze (reconcile-proposal.ts):
 *   · la FECHA DE ARRANQUE solo la propone cuando el proyecto no tenía (`existente ?? kickoff`): su
 *     `desde` es siempre null, y una fecha que hoy puso una persona choca;
 *   · el TIPO de actividad lo copia tal cual de la fase existente: nunca es un cambio que proponga,
 *     así que una diferencia es una edición humana posterior y no se revierte.
 * Por eso la conversión aplicada entera da lo mismo que `apply-items` salvo en esos dos casos, y
 * los dos son a propósito (lib/timeline/borrador.test.ts, «paridad»).
 *
 * ── E2a: «REGENERAR TODO» DEJA UN SOLO BORRADOR, CON FASES Y TAREAS ───────────
 * Nace el formato `borrador-v1` escrito de verdad (lo escriben /estructura y /analyze) y dos tipos
 * de cambio de TAREA: `tarea-nueva` y `tarea-se-va`. Nadie produce otros antes del chat (E3): una
 * tarea que cambia o se muda, o una fase que se va, se leen como DESCONOCIDOS y bloquean.
 *   · El estado de las tareas no se guarda como máquina de estados: se DEDUCE de la corrida del
 *     paso 2 (`estadoDeLasTareas`). Aplicar se bloquea solo mientras la corrida está viva.
 *   · Las tareas de una fase valen si la fase, como quedaría, conserva el nombre y las semanas con
 *     que se armaron (`tareasArmadasPara`): es el cierre de dependencias del plan (§2.1, paso 6).
 *   · Lo que tiene avance o se escribió a mano (`isKept`) nunca se quita, y una tarea que se va
 *     choca si alguien la editó (título, semana, notas, dueño, tipo o fechas fijadas) después.
 * El núcleo es puro: la pantalla y el servidor evalúan con la misma función y las mismas tareas
 * (solo lo que viaja en el cable, sin `order` ni fechas reales).
 */
import { huella as huellaDeTitulo, type Party, type TipoDeTarea } from "./assist-items"; // sin ciclo: assist-items no importa nada
import { estaColgada } from "@/lib/agents/run-colgada"; // puro, client-safe
import { isKept } from "./regen-columnas";
import { motivoDePorValidar } from "./semana-cero-tareas";
import { avisoDeRepetida, indexarTareasPorTitulo, type AvisoRepetida } from "./tarea-repetida";
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
import { evaluarMagnitud, frasesDeCambios, unirFrases, type MagnitudPropuesta } from "./magnitud-propuesta";

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

/**
 * Una tarea GUARDADA, con solo lo que viaja en el cable (GET del cronograma): la pantalla y el
 * servidor la evalúan igual. Sin `order` (reordenar no es editar) ni fechas reales.
 */
export interface TareaDelVivo {
  id: string;
  title: string;
  weekIndex: number;
  notes: string | null;
  party: Party | null;
  type: TipoDeTarea | null;
  status: string;
  source: string;
  /** `startDateOverride` / `dueDateOverride`, YYYY-MM-DD: una fecha fijada a mano es una edición. */
  inicioFijado: string | null;
  finFijado: string | null;
  /**
   * Opcional: solo lo usa la fusión del paso 2 para no borrar y recrear una tarea idéntica (R4b,
   * lib/timeline/tareas-del-detalle.ts). No entra en la foto de la tarea ni en el plan. Sin él, se
   * toma como `false`.
   */
  needsValidation?: boolean;
}

/** Una fase del cronograma vivo (o de la foto `base`), en su orden. */
export interface FaseViva {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  /** Sus tareas, en su orden (semana y `order`). `undefined` = no se leyeron (el handoff, la foto
   *  de E1): una tarea que se va choca, que es la dirección segura. */
  tareas?: TareaDelVivo[];
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

/** Cómo estaba una tarea que se va cuando se armó el cambio: si hoy es otra cosa, alguien la editó. */
export interface FotoDeTarea {
  title: string;
  weekIndex: number;
  notes: string | null;
  party: Party | null;
  type: TipoDeTarea | null;
  inicioFijado: string | null;
  finFijado: string | null;
}
/** Lo que se crea. `fuga`: el título o la nota cruzan la frontera del material interno (solo avisa). */
export interface ContenidoDeTareaNueva {
  title: string;
  weekIndex: number;
  notes: string | null;
  party: Party | null;
  type: TipoDeTarea | null;
  needsValidation: boolean;
  motivoPorValidar: string | null;
  fuga: { campo: "titulo" | "nota"; motivo: string; motivoDeLaNota?: string } | null;
}
/** Una tarea que se crea. No guarda `desde`: sería siempre la huella de su título (se calcula al evaluar). */
export interface CambioTareaNueva {
  tipo: "tarea-nueva";
  clave: string;
  /** Su fase: el id de una existente o la clave (`n:…`) de una fase nueva del mismo borrador. */
  fase: string;
  tarea: ContenidoDeTareaNueva;
  motivo?: string;
}
/** Una tarea pendiente de la IA que se quita. Se identifica por su id; su `desde` es la foto al fusionar. */
export interface CambioTareaSeVa {
  tipo: "tarea-se-va";
  clave: string;
  tareaId: string;
  faseId: string;
  desde: FotoDeTarea;
  motivo?: string;
}
export type CambioDeTarea = CambioTareaNueva | CambioTareaSeVa;
export type CambioDeEstructura = CambioDeAncla | CambioDeOrden | CambioFaseNueva | CambioFaseCambia;
export type Cambio = CambioDeEstructura | CambioDeTarea;

export const esCambioDeTarea = (c: Cambio): c is CambioDeTarea => c.tipo === "tarea-nueva" || c.tipo === "tarea-se-va";

export type OrigenDelBorrador = "handoff" | "contexto";

/** Quién pidió el borrador: «Regenerar todo» (ya había tareas de la IA) o «Generar cronograma». */
export type PedidoDelBorrador = "regenerar" | "primera";
/** La corrida del paso 2 que arma (o armó) las tareas, y si ya se fusionaron. */
export interface TareasDelBorrador {
  corrida: string | null;
  listas: boolean;
}
export type EstadoDeLasTareas = "listas" | "faltan" | "armando" | "fallo";

export interface Borrador {
  formato: typeof FORMATO_BORRADOR;
  /** Cuenta las ediciones del borrador. El formato viejo no la tiene: 0. */
  version: number;
  origen: OrigenDelBorrador;
  /** Lo que la IA notó y no se aplica solo (interno). */
  observaciones: string[];
  cambios: Cambio[];
  /** Solo al LEER un `borrador-v1`: cuántos cambios son de un tipo que esta versión no sabe aplicar.
   *  Nunca se guarda. */
  desconocidos?: number;
  /** El formato viejo y el handoff: null. */
  pedido: PedidoDelBorrador | null;
  /** null = no espera tareas (el handoff, el formato viejo). */
  tareas: TareasDelBorrador | null;
  /** Por fase (id real o `n:…`): el nombre y las semanas con que se armaron sus tareas. */
  tareasArmadasPara: Record<string, { nombre: string; semanas: number }>;
}

/**
 * El estado de las tareas de un borrador, DEDUCIDO de su corrida (no se guarda): «armando» mientras
 * la corrida está viva (PENDING o RUNNING y no colgada, con el umbral único de `estaColgada`),
 * «fallo» si murió, falló o terminó sin fusionar, «faltan» si nunca arrancó. null = no espera tareas.
 */
export function estadoDeLasTareas(
  t: TareasDelBorrador | null,
  corrida: { status: string; updatedAt: Date } | null,
  ahora: Date = new Date(),
): EstadoDeLasTareas | null {
  if (t === null) return null;
  if (t.listas) return "listas";
  if (t.corrida === null) return "faltan";
  if (corrida === null) return "fallo"; // la fila de la corrida no está
  if ((corrida.status === "PENDING" || corrida.status === "RUNNING") && !estaColgada(corrida, ahora)) return "armando";
  return "fallo"; // ERROR, DONE sin fusionar, ARCHIVED o colgada
}

export const claveDeCampo = (faseId: string, campo: CampoDeFase): string => `fase:${faseId}:${campo}`;
/** Solo para CONVERTIR el formato viejo: un productor de v1 nunca deriva claves de posiciones. */
export const claveDeNueva = (indice: number): string => `nueva:${indice}`;
export const claveDeTareaQueSeVa = (tareaId: string): string => `tarea:${tareaId}:se-va`;
/** El generador de claves por defecto. Las claves las genera solo el servidor; los tests inyectan uno. */
export const claveAleatoria = (): string => globalThis.crypto.randomUUID();
export const claveDeTareaNueva = (nuevaClave: () => string = claveAleatoria): string => `t:${nuevaClave()}`;

/** `n:` + 8 hex de un id aleatorio, única dentro del borrador (si choca, se genera otra). */
export function claveDeFaseNueva(nuevaClave: () => string, usadas: Set<string>): string {
  for (let intento = 0; intento < 100; intento++) {
    const hex = nuevaClave().replace(/-/g, "").slice(0, 8);
    const clave = `n:${hex}`;
    if (hex && !usadas.has(clave)) {
      usadas.add(clave);
      return clave;
    }
  }
  // Solo con un generador roto (un test): aun así, nunca dos claves iguales.
  let n = usadas.size;
  while (usadas.has(`n:${n}`)) n++;
  usadas.add(`n:${n}`);
  return `n:${n}`;
}

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
    pedido: null,
    tareas: null,
    tareasArmadasPara: {},
  };
}

/** Las fases nuevas de la conversión (`nueva:<i>`) pasan a claves de productor (`n:…`, nunca
 *  derivadas de posiciones), y el `despuesDe` las sigue. La comparten los dos productores de abajo. */
function conClavesDeProductor(cambios: readonly Cambio[], nuevaClave: () => string): Cambio[] {
  const usadas = new Set<string>();
  const remapeo = new Map<string, string>();
  for (const c of cambios) {
    if (c.tipo === "fase-nueva") remapeo.set(c.clave, claveDeFaseNueva(nuevaClave, usadas));
  }
  return cambios.map((c) =>
    c.tipo === "fase-nueva"
      ? { ...c, clave: remapeo.get(c.clave) ?? c.clave, despuesDe: c.despuesDe === null ? null : remapeo.get(c.despuesDe) ?? c.despuesDe }
      : c,
  );
}

/**
 * El borrador que deja el paso 1 de «Regenerar todo» / «Generar cronograma» (POST /estructura): la
 * propuesta de fases convertida, con las claves de las fases nuevas en el formato de un productor
 * (`n:…`, nunca derivadas de posiciones) y esperando las tareas del paso 2.
 */
export function borradorBase(i: {
  propuesta: ProposalLike;
  vivo: Vivo;
  pedido: PedidoDelBorrador;
  nuevaClave?: () => string;
}): Borrador {
  const viejo = convertirPropuestaVieja(i.propuesta, i.vivo);
  return {
    ...viejo,
    version: 0,
    origen: "contexto",
    cambios: conClavesDeProductor(viejo.cambios, i.nuevaClave ?? claveAleatoria),
    pedido: i.pedido,
    tareas: { corrida: null, listas: false },
    tareasArmadasPara: {},
  };
}

/**
 * El borrador que deja el HANDOFF (E2b), o null si no hay nada que se pueda aplicar: un productor sin
 * cambios nunca escribe. Solo fases y no espera tareas (`tareas: null`). La conversión es exacta para
 * este productor (arriba, las dos inferencias) y el `desde` queda fijado contra `vivo`, lo que leyó el
 * servidor: los choques son los mismos en cualquier computadora. `propuesta` nunca trae `origen`.
 * No es `borradorBase` con otro origen: aquél siempre devuelve un borrador que espera tareas.
 */
export function borradorDelHandoff(i: { propuesta: ProposalLike; vivo: Vivo; nuevaClave?: () => string }): Borrador | null {
  const viejo = convertirPropuestaVieja(i.propuesta, i.vivo);
  const b: Borrador = {
    ...viejo,
    version: 0,
    origen: "handoff",
    cambios: conClavesDeProductor(viejo.cambios, i.nuevaClave ?? claveAleatoria),
    pedido: null,
    tareas: null,
    tareasArmadasPara: {},
  };
  return planDeAplicacion(i.vivo, b).aplicables > 0 ? b : null;
}

/** El borrador que marca «armando las tareas» cuando no había propuesta de fases (0 cambios de fases).
 *  `observaciones`: lo que notó el paso 1 sin proponer (lo acordado que no entró). Van en el borrador
 *  para que la barra las muestre y sobrevivan a recargar o a descartar (revisión de E2a). */
export function borradorVacio(i: { pedido: PedidoDelBorrador; corrida: string; observaciones?: readonly string[] }): Borrador {
  return {
    formato: FORMATO_BORRADOR,
    version: 0,
    origen: "contexto",
    observaciones: [...(i.observaciones ?? [])],
    cambios: [],
    pedido: i.pedido,
    tareas: { corrida: i.corrida, listas: false },
    tareasArmadasPara: {},
  };
}

/** «regenerar» si el cronograma ya tiene tareas de la IA; si no, «primera». La ÚNICA fuente del pedido. */
export function pedidoDelCronograma(tareas: ReadonlyArray<{ source: string | null | undefined }>): PedidoDelBorrador {
  return tareas.some((t) => t.source === "AGENT" || t.source === "MODIFIED") ? "regenerar" : "primera";
}

/** ¿Lo guardado es el formato nuevo? */
export function esBorradorV1(json: unknown): json is Record<string, unknown> {
  return esObjeto(json) && json.formato === FORMATO_BORRADOR;
}

/** La versión de un `borrador-v1` guardado, o null (el formato viejo no la tiene). */
export function versionDelBorrador(json: unknown): number | null {
  return esBorradorV1(json) && typeof json.version === "number" ? json.version : null;
}

/**
 * ¿Lo guardado es un borrador VACÍO que espera sus tareas? Es el que nace cuando el paso 1 no propuso
 * cambios de fases (`borradorVacio`): todavía no hay nada que decidir ni barra donde hacerlo. El chat,
 * «Qué hacer acá» y el cartel dicen que la IA está armando las tareas, no que hay una propuesta por
 * decidir (revisión de E2a). Mira el JSON crudo: no necesita leer la corrida.
 * ⚠ El handoff igual no lo pisa (`propuestaPorDecidir`): la corrida pagada se perdería.
 */
export function esVacioEsperandoTareas(json: unknown): boolean {
  if (!esBorradorV1(json) || !Array.isArray(json.cambios) || json.cambios.length > 0) return false;
  return esObjeto(json.tareas) && json.tareas.listas === false;
}

/** El borrador VACÍO que espera sus tareas, según su corrida. «fallo»: nadie las está armando (la
 *  corrida falló o quedó colgada): se descarta o se vuelve a intentar. */
export type EstadoDelVacio = "armando" | "fallo";

/**
 * ¿El borrador VACÍO espera a la IA, o su corrida ya no va a traer nada? Puro. Cierre de la revisión de
 * E2a: `esVacioEsperandoTareas` solo mira el JSON, y con la corrida muerta la bandeja, el chat y «Qué
 * hacer acá» decían «la IA está armando las tareas, espera» sin salida. `tareas` es el estado deducido
 * de la corrida (`estadoDeLasTareas`); null = no se sabe, y se dice lo de antes («armando»), que es lo
 * prudente: no se afirma un fallo que no se vio. null = no es el borrador vacío.
 */
export function estadoDelVacio(json: unknown, tareas: EstadoDeLasTareas | null): EstadoDelVacio | null {
  if (!esVacioEsperandoTareas(json)) return null;
  return tareas === "armando" || tareas === null ? "armando" : "fallo";
}

/** La corrida del borrador VACÍO que espera sus tareas (para leer varias de una vez), o null. */
export function corridaDelVacio(json: unknown): string | null {
  if (!esVacioEsperandoTareas(json)) return null;
  const corrida = (json as { tareas: Record<string, unknown> }).tareas.corrida;
  return typeof corrida === "string" && corrida.length > 0 ? corrida : null;
}

/** El cartel «El cronograma tiene una propuesta sin decidir» (widget y rail): hay una guardada y NO es
 *  el borrador vacío que espera sus tareas (ahí no hay nada que revisar todavía). */
export const hayPropuestaParaRevisar = (json: unknown): boolean => json != null && !esVacioEsperandoTareas(json);

/** ¿El v1 guardado trae algún cambio de tareas? Mira el tipo crudo (también uno que esta versión no
 *  conoce): decide el permiso de aplicar, y ante la duda cuenta como tocar tareas. */
export function traeCambiosDeTareas(json: unknown): boolean {
  return (
    esBorradorV1(json) &&
    Array.isArray(json.cambios) &&
    json.cambios.some((c) => esObjeto(c) && typeof c.tipo === "string" && c.tipo.startsWith("tarea-"))
  );
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

const PARTIES: readonly Party[] = ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"];
const TIPOS_DE_TAREA: readonly TipoDeTarea[] = ["SESSION", "TASK"];
/** undefined = forma inválida (distinto de null, que es «sin valor»). */
const leerParty = (v: unknown): Party | null | undefined =>
  v === null ? null : typeof v === "string" && (PARTIES as readonly string[]).includes(v) ? (v as Party) : undefined;
const leerTipoDeTarea = (v: unknown): TipoDeTarea | null | undefined =>
  v === null ? null : typeof v === "string" && (TIPOS_DE_TAREA as readonly string[]).includes(v) ? (v as TipoDeTarea) : undefined;
const leerTextoONulo = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" ? v : undefined);
const esSemana = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const esTitulo = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function leerFotoDeTarea(v: unknown): FotoDeTarea | null {
  if (!esObjeto(v) || !esTitulo(v.title) || !esSemana(v.weekIndex)) return null;
  const notes = leerTextoONulo(v.notes);
  const party = leerParty(v.party);
  const type = leerTipoDeTarea(v.type);
  const inicio = leerTextoONulo(v.inicioFijado);
  const fin = leerTextoONulo(v.finFijado);
  if (notes === undefined || party === undefined || type === undefined || inicio === undefined || fin === undefined) return null;
  return { title: v.title, weekIndex: v.weekIndex, notes, party, type, inicioFijado: dia(inicio), finFijado: dia(fin) };
}

function leerFuga(v: unknown): ContenidoDeTareaNueva["fuga"] | undefined {
  if (v === null) return null;
  if (!esObjeto(v) || (v.campo !== "titulo" && v.campo !== "nota") || typeof v.motivo !== "string") return undefined;
  if (!(v.motivoDeLaNota === undefined || typeof v.motivoDeLaNota === "string")) return undefined;
  return { campo: v.campo, motivo: v.motivo, ...(typeof v.motivoDeLaNota === "string" ? { motivoDeLaNota: v.motivoDeLaNota } : {}) };
}

function leerContenidoDeTarea(v: unknown): ContenidoDeTareaNueva | null {
  if (!esObjeto(v) || !esTitulo(v.title) || !esSemana(v.weekIndex) || typeof v.needsValidation !== "boolean") return null;
  const notes = leerTextoONulo(v.notes);
  const party = leerParty(v.party);
  const type = leerTipoDeTarea(v.type);
  const motivoPorValidar = leerTextoONulo(v.motivoPorValidar);
  const fuga = leerFuga(v.fuga);
  if (notes === undefined || party === undefined || type === undefined || motivoPorValidar === undefined || fuga === undefined) {
    return null;
  }
  return { title: v.title, weekIndex: v.weekIndex, notes, party, type, needsValidation: v.needsValidation, motivoPorValidar, fuga };
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
    case "tarea-nueva": {
      const tarea = leerContenidoDeTarea(v.tarea);
      if (typeof v.fase !== "string" || !v.fase || !tarea) return null;
      return { tipo: "tarea-nueva", clave: v.clave, fase: v.fase, tarea, ...(motivo ? { motivo: motivo.v } : {}) };
    }
    case "tarea-se-va": {
      const desde = leerFotoDeTarea(v.desde);
      if (typeof v.tareaId !== "string" || !v.tareaId || typeof v.faseId !== "string" || !v.faseId || !desde) return null;
      return {
        tipo: "tarea-se-va",
        clave: v.clave,
        tareaId: v.tareaId,
        faseId: v.faseId,
        desde,
        ...(motivo ? { motivo: motivo.v } : {}),
      };
    }
    default:
      return null;
  }
}

function leerTareasDelBorrador(v: unknown): TareasDelBorrador | null {
  if (!esObjeto(v) || !(v.corrida === null || typeof v.corrida === "string") || typeof v.listas !== "boolean") return null;
  return { corrida: v.corrida, listas: v.listas };
}

function leerTareasArmadasPara(v: unknown): Borrador["tareasArmadasPara"] {
  const out: Borrador["tareasArmadasPara"] = {};
  if (!esObjeto(v)) return out;
  for (const [fase, x] of Object.entries(v)) {
    if (!esObjeto(x) || typeof x.nombre !== "string") continue;
    if (typeof x.semanas !== "number" || !Number.isInteger(x.semanas) || x.semanas < 1) continue;
    out[fase] = { nombre: x.nombre, semanas: x.semanas };
  }
  return out;
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
      pedido: json.pedido === "regenerar" || json.pedido === "primera" ? json.pedido : null,
      tareas: leerTareasDelBorrador(json.tareas),
      tareasArmadasPara: leerTareasArmadasPara(json.tareasArmadasPara),
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
  /** Solo en una tarea `excluido` HEREDADO: la clave del cambio de fase excluido del que depende.
   *  No se marca sola: vuelve cuando se marca ese cambio. */
  dependeDe?: string;
}

export type Lugar = { tipo: "existente"; id: string } | { tipo: "nueva"; clave: string };

/** Las tareas que se escriben al aplicar. */
export interface EscriturasDeTareas {
  /** Los ids de las que se quitan, en el orden del cronograma vivo. */
  seVan: string[];
  /** Las que se crean, en el orden del borrador. */
  nuevas: Array<{ clave: string; fase: Lugar; tarea: ContenidoDeTareaNueva }>;
}

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
  /** La estructura (sin cambios desde E1) y las tareas. */
  escrituras: EscriturasDeEstructura & { tareas: EscriturasDeTareas };
  /** Si no se puede aplicar entero, por qué (un borrador de una versión más nueva, o las tareas
   *  todavía armándose). null = se puede. */
  bloqueo: string | null;
  /** El que recibió el plan (lo deduce quien llama, de la corrida): null = no espera tareas. */
  estadoDeTareas: EstadoDeLasTareas | null;
}

const CHOQUE_CAMPO = "Lo cambiaste a mano después de la propuesta: queda como lo dejaste.";
const CHOQUE_SIN_TAREAS = "No se leyeron las tareas de esta fase: la tarea queda como está.";
const CHOQUE_TAREA_MUDADA = "La moviste a otra fase después de la propuesta: queda donde la dejaste.";
const CHOQUE_TAREA_CON_AVANCE = "La tarea ya tiene avance o la escribiste a mano: no se quita.";
const CHOQUE_TAREA_EDITADA = "La editaste a mano después de la propuesta: queda como la dejaste.";
const CHOQUE_DE_LA_FASE =
  "Su fase cambió después de la propuesta (a mano, o con un cambio que choca): sus tareas quedan fuera.";
export const BLOQUEO_TAREAS_EN_CURSO =
  "La IA todavía está armando las tareas de esta propuesta: espera a que termine para aplicar.";
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
 *  pantalla y el chat tal cual, así que habla de la barra que el CSE tiene enfrente. Desde E2a la
 *  propuesta puede traer también tareas: se nombra «del cronograma», no «de cambios de fases». */
export const MENSAJE_PROPUESTA_ABIERTA =
  "Hay una propuesta del cronograma sin decidir (arriba del Gantt): aplícala o descártala antes de guardar este cambio.";

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

function evaluar(c: CambioDeEstructura, vivo: Vivo, nuevas: ReadonlyMap<string, CambioFaseNueva>): Evaluacion {
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
    default: {
      // Un tipo de estructura nuevo sin su `case` no compila (no se evalúa en silencio como otro).
      const _: never = c;
      return _;
    }
  }
}

// ── Las tareas en el plan ────────────────────────────────────────────────────

/** El índice de lo vivo: nada de `find` lineal (Wherex ronda las 300 tareas). */
interface IndiceDelVivo {
  fasePorId: Map<string, FaseViva>;
  tareaPorId: Map<string, { tarea: TareaDelVivo; faseId: string }>;
  /** ¿El vivo trae las tareas? Si no, una tarea que se va no se puede evaluar. */
  conTareas: boolean;
}

function indexar(vivo: Vivo): IndiceDelVivo {
  const fasePorId = new Map<string, FaseViva>();
  const tareaPorId = new Map<string, { tarea: TareaDelVivo; faseId: string }>();
  let conTareas = false;
  for (const f of vivo.fases) {
    fasePorId.set(f.id, f);
    if (!f.tareas) continue;
    conTareas = true;
    for (const t of f.tareas) tareaPorId.set(t.id, { tarea: t, faseId: f.id });
  }
  return { fasePorId, tareaPorId, conTareas };
}

/** La foto de una tarea viva: lo que se compara con el `desde` de la que se va. */
export function fotoDeTarea(t: TareaDelVivo): FotoDeTarea {
  return {
    title: t.title,
    weekIndex: t.weekIndex,
    notes: t.notes ?? null,
    party: t.party ?? null,
    type: t.type ?? null,
    inicioFijado: dia(t.inicioFijado),
    finFijado: dia(t.finFijado),
  };
}

const mismaFoto = (a: FotoDeTarea, b: FotoDeTarea) =>
  a.title === b.title &&
  a.weekIndex === b.weekIndex &&
  a.notes === b.notes &&
  a.party === b.party &&
  a.type === b.type &&
  dia(a.inicioFijado) === dia(b.inicioFijado) &&
  dia(a.finFijado) === dia(b.finFijado);

/** La regla propia de una tarea que se va (§2.1, paso 3). null = pasa al estado base y al cierre. */
function evaluarSeVa(c: CambioTareaSeVa, ind: IndiceDelVivo): Evaluacion | null {
  const fase = ind.fasePorId.get(c.faseId);
  if (fase ? fase.tareas === undefined : !ind.conTareas) return { estado: "choque", choque: CHOQUE_SIN_TAREAS };
  const viva = ind.tareaPorId.get(c.tareaId);
  if (!viva) return { estado: "ya-esta" };
  if (viva.faseId !== c.faseId) return { estado: "choque", choque: CHOQUE_TAREA_MUDADA };
  if (isKept(viva.tarea)) return { estado: "choque", choque: CHOQUE_TAREA_CON_AVANCE };
  if (!mismaFoto(fotoDeTarea(viva.tarea), c.desde)) return { estado: "choque", choque: CHOQUE_TAREA_EDITADA };
  return null;
}

/** Nombre y semanas de cada fase (id o `n:…`) con los cambios de estructura que cumplen `incluye`. */
function fasesProyectadas(
  vivo: Vivo,
  cambios: readonly Cambio[],
  estados: ReadonlyArray<{ estado: EstadoDelCambio } | undefined>,
  incluye: (e: EstadoDelCambio) => boolean,
): Map<string, { name: string; durationWeeks: number }> {
  const out = new Map(vivo.fases.map((f) => [f.id, { name: f.name, durationWeeks: f.durationWeeks }]));
  cambios.forEach((c, i) => {
    const e = estados[i];
    if (!e || !incluye(e.estado)) return;
    if (c.tipo === "fase-nueva") out.set(c.clave, { name: c.fase.name, durationWeeks: c.fase.durationWeeks });
    else if (c.tipo === "fase-cambia") {
      const f = out.get(c.faseId);
      if (!f) return;
      if (c.campo === "name") f.name = String(c.a);
      else if (c.campo === "durationWeeks") f.durationWeeks = Number(c.a);
    }
  });
  return out;
}

const coincide = (x: { name: string; durationWeeks: number } | undefined, armada: { nombre: string; semanas: number }) =>
  !!x && normalizarNombre(x.name) === normalizarNombre(armada.nombre) && x.durationWeeks === armada.semanas;

const faseDeLaTarea = (c: CambioDeTarea): string => (c.tipo === "tarea-nueva" ? c.fase : c.faseId);
const llaveDeTarea = (titulo: string, semana: number) => `${huellaDeTitulo(titulo)}|${semana}`;

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
    case "tarea-nueva": {
      const t = c.tarea;
      return [c.fase, t.title, t.weekIndex, t.notes, t.party, t.type, t.needsValidation];
    }
    case "tarea-se-va":
      return c.tareaId;
    default: {
      // Sin esto, un tipo nuevo sin su `case` metería `undefined` en la huella sin error de compilación.
      const _: never = c;
      return _;
    }
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
 *
 * El orden de evaluación es determinista (E2a, §2.1):
 *   1. la ESTRUCTURA, como en E1;
 *   2. cómo quedaría cada fase —nombre y semanas— con lo marcado y con todo lo que se puede marcar;
 *   3. las tareas que se van: su regla propia (avance, edición a mano, mudanza);
 *   4-5. las nuevas: una que ya está (misma huella de título y misma semana entre las que sobreviven
 *        en su fase, contando cuántas hay) no se escribe;
 *   6. el CIERRE: las tareas de una fase valen si la fase, como quedaría, conserva el nombre y las
 *      semanas con que se armaron (`tareasArmadasPara`). Si no, quedan fuera con su padre (heredado)
 *      o chocan. Un hijo heredado no se marca solo: vuelve cuando se marca el padre.
 * `tareas`: el estado de las tareas del borrador (lo deduce quien llama, de la corrida): mientras
 * se arman, no se aplica.
 */
export function planDeAplicacion(
  vivo: Vivo,
  borrador: Borrador,
  sin: Iterable<string> = [],
  { tareas = null }: { tareas?: EstadoDeLasTareas | null } = {},
): PlanDeAplicacion {
  const fuera = new Set(sin);
  const nuevas = new Map(
    borrador.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva").map((c) => [c.clave, c]),
  );
  const ind = indexar(vivo);
  const base = (c: Cambio): EstadoDelCambio => (fuera.has(c.clave) ? "excluido" : "aplica");
  type Estado = { estado: EstadoDelCambio; choque?: string; dependeDe?: string };
  const desdeEvaluacion = (c: Cambio, ev: Evaluacion): Estado =>
    ev.estado === "choque"
      ? { estado: "choque", choque: ev.choque }
      : ev.estado === "ya-esta"
        ? { estado: "ya-esta" }
        : { estado: base(c) };
  const estados: Array<Estado | undefined> = new Array(borrador.cambios.length);

  // 1) La estructura: `evaluar` de E1, sin cambios.
  borrador.cambios.forEach((c, i) => {
    if (!esCambioDeTarea(c)) estados[i] = desdeEvaluacion(c, evaluar(c, vivo, nuevas));
  });

  // 2) Cómo quedaría cada fase, para el cierre (sin llamar a otro plan).
  const marcada = fasesProyectadas(vivo, borrador.cambios, estados, (e) => e === "aplica");
  const entera = fasesProyectadas(vivo, borrador.cambios, estados, (e) => e === "aplica" || e === "excluido");

  // 3) Las tareas que se van.
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-se-va") return;
    const ev = evaluarSeVa(c, ind);
    estados[i] = ev ? desdeEvaluacion(c, ev) : { estado: base(c) };
  });

  // 4) Las que sobreviven en cada fase: las vivas menos las que se van marcadas. Se cuentan por
  //    huella del título + semana (dos iguales en la misma semana son dos), con la semana ACOTADA a
  //    la duración final de su fase: al acortarla, el servidor las mueve a la última semana y ahí es
  //    donde una nueva igual sería un duplicado (revisión de E2a).
  const seVanMarcadas = new Set<string>();
  borrador.cambios.forEach((c, i) => {
    if (c.tipo === "tarea-se-va" && estados[i]?.estado === "aplica") seVanMarcadas.add(c.tareaId);
  });
  const semanaFinal = (fase: string, semana: number): number => {
    const dur = marcada.get(fase)?.durationWeeks;
    return dur === undefined ? semana : acotarSemana(semana, dur);
  };
  const cuentas = new Map<string, Map<string, number>>();
  const cuentaDe = (fase: string): Map<string, number> => {
    let cuenta = cuentas.get(fase);
    if (cuenta) return cuenta;
    cuenta = new Map();
    for (const t of ind.fasePorId.get(fase)?.tareas ?? []) {
      if (seVanMarcadas.has(t.id)) continue;
      const k = llaveDeTarea(t.title, semanaFinal(fase, t.weekIndex));
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }
    cuentas.set(fase, cuenta);
    return cuenta;
  };

  // 5) Las nuevas, en el orden del borrador: cada una que encuentra una igual la consume.
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-nueva") return;
    if (!ind.fasePorId.has(c.fase) && !nuevas.has(c.fase)) {
      estados[i] = { estado: "choque", choque: CHOQUE_FASE_BORRADA };
      return;
    }
    const cuenta = cuentaDe(c.fase);
    const k = llaveDeTarea(c.tarea.title, semanaFinal(c.fase, c.tarea.weekIndex));
    const hay = cuenta.get(k) ?? 0;
    if (hay > 0) {
      cuenta.set(k, hay - 1);
      estados[i] = { estado: "ya-esta" };
      return;
    }
    estados[i] = { estado: base(c) };
  });

  // 6) El cierre, por fase: solo toca tareas que se podrían aplicar.
  const padreExcluido = (fase: string): string | undefined => {
    const j = borrador.cambios.findIndex(
      (c, i) =>
        estados[i]?.estado === "excluido" &&
        ((c.tipo === "fase-nueva" && c.clave === fase) ||
          (c.tipo === "fase-cambia" && c.faseId === fase && (c.campo === "name" || c.campo === "durationWeeks"))),
    );
    return j >= 0 ? borrador.cambios[j].clave : undefined;
  };
  borrador.cambios.forEach((c, i) => {
    if (!esCambioDeTarea(c)) return;
    const e = estados[i];
    if (!e || (e.estado !== "aplica" && e.estado !== "excluido")) return;
    const fase = faseDeLaTarea(c);
    const armada = borrador.tareasArmadasPara[fase];
    if (!armada) {
      estados[i] = { estado: "choque", choque: CHOQUE_DE_LA_FASE };
      return;
    }
    if (coincide(marcada.get(fase), armada)) return;
    const padre = coincide(entera.get(fase), armada) ? padreExcluido(fase) : undefined;
    estados[i] = padre ? { estado: "excluido", dependeDe: padre } : { estado: "choque", choque: CHOQUE_DE_LA_FASE };
  });

  const items: ItemDelPlan[] = borrador.cambios.map((cambio, i) => {
    const e = estados[i]!;
    return {
      numero: i + 1,
      cambio,
      estado: e.estado,
      ...(e.choque !== undefined ? { choque: e.choque } : {}),
      ...(e.dependeDe !== undefined ? { dependeDe: e.dependeDe } : {}),
    };
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
  const seVanAplicadas = new Set(
    aplicadas.flatMap((c) => (c.tipo === "tarea-se-va" ? [c.tareaId] : [])),
  );
  const escrituras: EscriturasDeEstructura & { tareas: EscriturasDeTareas } = {
    ancla: ancla ? ancla.a : null,
    // En el orden del cronograma vivo: el mismo orden de escritura en la pantalla y en el servidor.
    fases: vivo.fases.filter((f) => porFase.has(f.id)).map((f) => ({ id: f.id, campos: porFase.get(f.id)! })),
    nuevas: aplicadas
      .filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva")
      .map((c) => ({ clave: c.clave, fase: c.fase })),
    orden: ordenFinal(vivo, aplicadas, nuevas),
    tareas: {
      seVan: vivo.fases.flatMap((f) => (f.tareas ?? []).filter((t) => seVanAplicadas.has(t.id)).map((t) => t.id)),
      nuevas: aplicadas
        .filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva")
        .map((c) => ({
          clave: c.clave,
          fase: ind.fasePorId.has(c.fase) ? { tipo: "existente", id: c.fase } : { tipo: "nueva", clave: c.fase },
          tarea: c.tarea,
        })),
    },
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
    bloqueo:
      borrador.desconocidos && borrador.desconocidos > 0
        ? BLOQUEO_VERSION_NUEVA
        : tareas === "armando"
          ? BLOQUEO_TAREAS_EN_CURSO
          : null,
    estadoDeTareas: tareas,
  };
}

/**
 * «Un borrador con 0 cambios vivos se descarta solo» (Canvas, desde la Tanda M): si TODO lo que
 * propone ya está así (una propuesta vieja, o el CSE igualó el cronograma a mano), no hay nada que
 * decidir. ⚠ Un choque NO cuenta como «ya está»: el CSE tiene que ver el ⚠ y descartarlo él.
 * ⚠ Y uno que ESPERA tareas («faltan» o «armando») tampoco: vacío todavía, pero se va a llenar. Uno
 * vacío cuya corrida falló sí (no queda nada que esperar).
 * Acepta el plan o el resumen: el resumen lista la estructura en `items` y las tareas en `grupos`.
 */
export function debeDescartarseSolo(plan: {
  bloqueo: string | null;
  items: ReadonlyArray<{ estado: EstadoDelCambio }>;
  estadoDeTareas?: EstadoDeLasTareas | null;
  grupos?: ReadonlyArray<{ estado: string }>;
}): boolean {
  if (plan.estadoDeTareas === "faltan" || plan.estadoDeTareas === "armando") return false;
  return (
    plan.bloqueo === null &&
    plan.items.every((it) => it.estado === "ya-esta") &&
    (plan.grupos ?? []).every((g) => g.estado === "ya-esta")
  );
}

/**
 * ¿La propuesta guardada todavía tiene algo que decidir? La usa el handoff antes de dejar la suya
 * (lib/timeline/borrador-del-handoff.ts): **una propuesta abierta no se pisa, sea del handoff o de las reuniones** —se
 * queda la abierta y se avisa a quien regeneró (respuesta 1 de Elías, 2026-09-24)—. Pisarla a mitad
 * de la revisión le cambiaba la lista al CSE, le hacía perder lo desmarcado y la foto, y su
 * «Aplicar» terminaba en un 409.
 * Una que ya no tiene nada que decidir (todo ya está así) no frena: reemplazarla no pierde nada, y
 * la pantalla igual la descartaría sola. Se convierte contra LO VIVO: el handoff no tiene la foto de
 * la pantalla, y para saber si queda algo por decidir alcanza con lo de hoy.
 * ⚠ Un v1 que ESPERA tareas (`tareas` sin `listas`) está por decidir sin leer la corrida: si el
 * handoff lo pisara a mitad del paso 2, la corrida pagada se perdería.
 */
export function propuestaPorDecidir(guardado: unknown, vivo: Vivo): boolean {
  const borrador = leerBorrador(guardado, vivo);
  if (!borrador) return false;
  if (borrador.tareas !== null && !borrador.tareas.listas) return true;
  return !debeDescartarseSolo(planDeAplicacion(vivo, borrador));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── PROYECTAR: cómo quedaría el cronograma (solo lectura) ────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** La marca sutil de una fila: el tono del token y las etiquetas cortas («nueva», «+1 semana», «movida»…). */
export interface MarcaDeFase {
  tono: "nueva" | "cambia";
  etiquetas: string[];
}

/** Una tarea de la vista «Ver la propuesta»: una viva que sobrevive, o una nueva marcada. */
export interface TareaProyectada {
  /** El id de la tarea viva, o null si es nueva. */
  id: string | null;
  /** El id de la viva, o la clave del cambio `tarea-nueva` (`t:…`): lo que identifica la fila. */
  clave: string;
  title: string;
  /** Acotada a la duración final de la fase: donde la deja el servidor al aplicar. */
  weekIndex: number;
  notes: string | null;
  party: Party | null;
  type: TipoDeTarea | null;
  status: string;
  source: string;
  needsValidation: boolean;
}

export interface FaseProyectada extends FaseNuevaPropuesta {
  /** El id de la fase existente, o la clave de la nueva (`nueva:<i>` o `n:…`): lo que identifica la fila. */
  clave: string;
  id: string | null;
  marca: MarcaDeFase | null;
  /** Las vivas que sobreviven (acotadas a la duración final) más las nuevas marcadas. Una fase
   *  existente cuyo vivo no trajo tareas lleva solo las nuevas. */
  tareas: TareaProyectada[];
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
 * Las tareas de una fase que se acorta caen en su última semana (el acotado vive acá desde E2a, y
 * el servidor hace lo mismo al escribir).
 */
export function proyectar(vivo: Vivo, borrador: Borrador, sin: Iterable<string> = []): Proyeccion {
  return proyectarConPlan(vivo, planDeAplicacion(vivo, borrador, sin));
}

const acotarSemana = (semana: number, duracion: number) => Math.min(semana, Math.max(duracion - 1, 0));
const etiquetaDeTareas = (signo: "+" | "−", n: number) => `${signo}${plural(n, "tarea", "tareas")}`;

function proyectarConPlan(vivo: Vivo, plan: PlanDeAplicacion): Proyeccion {
  const porId = new Map(vivo.fases.map((f) => [f.id, f]));
  const campos = new Map(plan.escrituras.fases.map((f) => [f.id, f.campos]));
  const nuevas = new Map(plan.escrituras.nuevas.map((n) => [n.clave, n.fase]));
  const orden = plan.aplicadas.find((c): c is CambioDeOrden => c.tipo === "orden");
  const idsFinales = plan.escrituras.orden.flatMap((l) => (l.tipo === "existente" ? [l.id] : []));
  const movidas = orden ? fasesMovidas(vivo.fases.map((f) => f.id), idsFinales) : new Set<string>();

  const fases: FaseProyectada[] = plan.escrituras.orden.map((l) => {
    if (l.tipo === "nueva") {
      const f = nuevas.get(l.clave)!;
      return { ...f, clave: l.clave, id: null, marca: { tono: "nueva", etiquetas: ["nueva"] }, tareas: [] };
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
    return { ...f, clave: l.id, id: l.id, marca: null, tareas: [] };
  });

  /* Las tareas: las vivas que sobreviven (en su orden) y después las nuevas marcadas (en el orden
     del borrador), todas acotadas a la duración final de su fase. */
  const seVan = new Set(plan.escrituras.tareas.seVan);
  const nuevasPorFase = new Map<string, EscriturasDeTareas["nuevas"]>();
  for (const n of plan.escrituras.tareas.nuevas) {
    const clave = n.fase.tipo === "existente" ? n.fase.id : n.fase.clave;
    nuevasPorFase.set(clave, [...(nuevasPorFase.get(clave) ?? []), n]);
  }
  const seVanPorFase = new Map<string, number>();
  for (const f of vivo.fases) {
    const n = (f.tareas ?? []).filter((t) => seVan.has(t.id)).length;
    if (n > 0) seVanPorFase.set(f.id, n);
  }
  for (const f of fases) {
    const vivas = f.id !== null ? (porId.get(f.id)?.tareas ?? []) : [];
    const agregadas = nuevasPorFase.get(f.clave) ?? [];
    f.tareas = [
      ...vivas
        .filter((t) => !seVan.has(t.id))
        .map((t) => ({
          id: t.id,
          clave: t.id,
          title: t.title,
          weekIndex: acotarSemana(t.weekIndex, f.durationWeeks),
          notes: t.notes ?? null,
          party: t.party ?? null,
          type: t.type ?? null,
          status: t.status,
          source: t.source,
          needsValidation: t.needsValidation ?? false,
        })),
      ...agregadas.map((n) => ({
        id: null,
        clave: n.clave,
        title: n.tarea.title,
        weekIndex: acotarSemana(n.tarea.weekIndex, f.durationWeeks),
        notes: n.tarea.notes,
        party: n.tarea.party,
        type: n.tarea.type,
        status: "PENDING",
        source: "AGENT",
        needsValidation: n.tarea.needsValidation,
      })),
    ];
    if (f.id === null && agregadas.length > 0 && f.marca) {
      f.marca = { ...f.marca, etiquetas: [...f.marca.etiquetas, etiquetaDeTareas("+", agregadas.length)] };
    }
  }

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
    const agregadas = nuevasPorFase.get(f.id)?.length ?? 0;
    if (agregadas > 0) etiquetas.push(etiquetaDeTareas("+", agregadas));
    const quitadas = seVanPorFase.get(f.id) ?? 0;
    if (quitadas > 0) etiquetas.push(etiquetaDeTareas("−", quitadas));
    if (etiquetas.length > 0) f.marca = { tono: "cambia", etiquetas };
  });

  return { ancla: plan.escrituras.ancla ?? dia(vivo.ancla), fases };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA ESTRUCTURA QUE VE EL PASO 2 ───────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fase como la ve el agente de tareas: la de la propuesta, con su id (real o `n:…`). */
export interface FaseHipotetica extends FaseNuevaPropuesta {
  /** El id real, o la clave `n:…` de una fase nueva del borrador. */
  id: string;
  existente: boolean;
  /** Las vivas; en una fase nueva, []. */
  tareas: TareaDelVivo[];
}
export interface EstructuraHipotetica {
  ancla: string | null;
  fases: FaseHipotetica[];
}

/**
 * La estructura sobre la que el paso 2 arma las tareas: el borrador SIN sus cambios de tareas,
 * proyectado con todo lo que no choca y sin mirar lo que desmarcó el CSE (eso vive en su pantalla).
 * Lo que el CSE desmarque después lo resuelve el cierre del plan con `tareasArmadasPara`.
 */
export function estructuraHipotetica(vivo: Vivo, borrador: Borrador): EstructuraHipotetica {
  const soloEstructura: Borrador = { ...borrador, cambios: borrador.cambios.filter((c) => !esCambioDeTarea(c)) };
  const p = proyectar(vivo, soloEstructura, []);
  const porId = new Map(vivo.fases.map((f) => [f.id, f]));
  return {
    ancla: p.ancla,
    fases: p.fases.map((f) => ({
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      id: f.clave,
      existente: f.id !== null,
      tareas: f.id !== null ? [...(porId.get(f.id)?.tareas ?? [])] : [],
    })),
  };
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

/** Una tarea de la lista de la barra (un renglón dentro de su grupo). */
export interface ItemDeTarea {
  clave: string;
  estado: EstadoDelCambio;
  signo: "+" | "−";
  titulo: string;
  /** La semana dentro de su fase, contando desde 1 (S1 = la primera de la fase). */
  semana: number;
  /** El ⚠ del choque, o que ya está (o ya no está). */
  aviso?: string;
  /** La casilla se puede tocar: aplica o la desmarcó el CSE. Una que quedó fuera con su cambio de
   *  fase (heredada) no: vuelve cuando se marca ese cambio. */
  seMarca: boolean;
  /** Por qué está «por validar» (el tooltip), si lo está. */
  porValidar?: string;
  /** El título o la nota cruzan la frontera del material interno. */
  fuga?: { campo: "titulo" | "nota"; motivo: string; motivoDeLaNota?: string };
  /** Ya existe una igual en OTRA fase (la más avanzada, si hay varias). */
  repetida?: AvisoRepetida;
}

/** Las tareas de UNA fase, en un solo renglón de la lista (con su casilla de grupo). */
export interface GrupoDeTareas {
  /** Sigue a los cambios de estructura: k + i + 1. */
  numero: number;
  /** La fase: el id de una existente o la clave `n:…` de una nueva. */
  fase: string;
  /** Su nombre en la propuesta. */
  nombre: string;
  /** Las que se crean y las que se quitan (sin contar las que ya están así). */
  nuevas: number;
  seVan: number;
  marcadas: number;
  aplicables: number;
  estado: "aplica" | "parcial" | "excluido" | "choque" | "ya-esta";
  /** El número (en la lista) del cambio de fase con el que quedaron fuera sus tareas, o null. */
  dependeDe: number | null;
  aviso?: string;
  tareas: ItemDeTarea[];
}

export interface ResumenDelBorrador {
  origen: OrigenDelBorrador;
  observaciones: string[];
  /** Solo la estructura, numerada 1..k (las tareas van en `grupos`). La huella usa la posición interna. */
  items: ItemDeLaLista[];
  /** Las tareas, un grupo por fase, en el orden de la propuesta. */
  grupos: GrupoDeTareas[];
  /** Todo lo marcado (estructura y tareas). */
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
  /** Las tareas que se escriben con lo marcado. */
  tareas: { nuevas: number; seVan: number };
  /** Hay alguna tarea que se va marcada: aplicar BORRA (se confirma). */
  borraAlgo: boolean;
  /** Alguna tarea marcada nace en una fase nueva. */
  fasesNuevasConTareas: boolean;
  /** Las tareas de esta propuesta no llegaron («faltan» o «fallo»): se aplican solo las fases. */
  faltanTareas: boolean;
  estadoDeTareas: EstadoDeLasTareas | null;
  /** Cómo quedaría con lo marcado: la vista «Ver la propuesta» (una evaluación menos por render). */
  proyeccion: Proyeccion;
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
    case "tarea-nueva":
      return `Tarea nueva «${c.tarea.title}» · S${c.tarea.weekIndex + 1}`;
    case "tarea-se-va":
      return `Se quita la tarea «${c.desde.title}» · S${c.desde.weekIndex + 1}`;
    default: {
      const _: never = c;
      return _;
    }
  }
}

/** El estado de un grupo de tareas, por lo que tiene marcado y lo que se puede marcar. */
function estadoDelGrupo(its: readonly ItemDelPlan[]): GrupoDeTareas["estado"] {
  const marcadas = its.filter((it) => it.estado === "aplica").length;
  const aplicables = its.filter((it) => it.estado === "aplica" || it.estado === "excluido").length;
  if (aplicables === 0) return its.some((it) => it.estado === "choque") ? "choque" : "ya-esta";
  return marcadas === aplicables ? "aplica" : marcadas === 0 ? "excluido" : "parcial";
}

/** Los grupos de tareas: uno por fase, en el orden en que aparece cada fase en la propuesta. */
function gruposDeTareas(
  vivo: Vivo,
  borrador: Borrador,
  plan: PlanDeAplicacion,
  numeroEnLaLista: ReadonlyMap<string, number>,
  k: number,
): GrupoDeTareas[] {
  const porFase = new Map<string, ItemDelPlan[]>();
  for (const it of plan.items) {
    if (!esCambioDeTarea(it.cambio)) continue;
    const fase = faseDeLaTarea(it.cambio);
    porFase.set(fase, [...(porFase.get(fase) ?? []), it]);
  }
  const vivas = new Map(vivo.fases.map((f) => [f.id, f]));
  const fasesNuevas = new Map(
    borrador.cambios.flatMap((c) => (c.tipo === "fase-nueva" ? [[c.clave, c.fase.name] as const] : [])),
  );
  const indice = indexarTareasPorTitulo(
    vivo.fases.flatMap((f) =>
      f.tareas ? [{ phaseId: f.id, phaseName: f.name, current: f.tareas.map((t) => ({ title: t.title, status: t.status })) }] : [],
    ),
  );
  return [...porFase.entries()].map(([fase, its], i) => {
    const tareas: ItemDeTarea[] = its.map((it) => {
      const c = it.cambio as CambioDeTarea;
      const heredada = it.dependeDe !== undefined;
      const aviso =
        it.estado === "choque"
          ? `⚠ ${it.choque}`
          : it.estado === "ya-esta"
            ? c.tipo === "tarea-nueva"
              ? "Ya está: hay una igual en esa semana."
              : "Ya no está en el cronograma."
            : undefined;
      const comun = {
        clave: c.clave,
        estado: it.estado,
        ...(aviso ? { aviso } : {}),
        seMarca: (it.estado === "aplica" || it.estado === "excluido") && !heredada,
      };
      if (c.tipo === "tarea-se-va") {
        return { ...comun, signo: "−" as const, titulo: c.desde.title, semana: c.desde.weekIndex + 1 };
      }
      const repetida = avisoDeRepetida(c.tarea.title, c.fase, indice);
      return {
        ...comun,
        signo: "+" as const,
        titulo: c.tarea.title,
        semana: c.tarea.weekIndex + 1,
        ...(c.tarea.needsValidation ? { porValidar: motivoDePorValidar(c.tarea) } : {}),
        ...(c.tarea.fuga ? { fuga: c.tarea.fuga } : {}),
        ...(repetida ? { repetida } : {}),
      };
    });
    const choques = its.filter((it) => it.estado === "choque");
    const heredada = its.find((it) => it.dependeDe !== undefined);
    const dependeDe = heredada?.dependeDe !== undefined ? (numeroEnLaLista.get(heredada.dependeDe) ?? null) : null;
    const vivos = its.filter((it) => it.estado !== "ya-esta");
    const textos = new Set(choques.map((it) => it.choque));
    const aviso =
      choques.length > 0
        ? choques.length === vivos.length && textos.size === 1
          ? `⚠ ${choques[0].choque}`
          : `⚠ ${choques.length === 1 ? "1 queda fuera" : `${choques.length} quedan fuera`}`
        : dependeDe !== null
          ? `Va con el cambio ${dependeDe}: si lo marcas, vuelven sus tareas.`
          : undefined;
    return {
      numero: k + i + 1,
      fase,
      nombre: borrador.tareasArmadasPara[fase]?.nombre ?? vivas.get(fase)?.name ?? fasesNuevas.get(fase) ?? fase,
      nuevas: vivos.filter((it) => it.cambio.tipo === "tarea-nueva").length,
      seVan: vivos.filter((it) => it.cambio.tipo === "tarea-se-va").length,
      marcadas: its.filter((it) => it.estado === "aplica").length,
      aplicables: its.filter((it) => it.estado === "aplica" || it.estado === "excluido").length,
      estado: estadoDelGrupo(its),
      dependeDe,
      ...(aviso ? { aviso } : {}),
      tareas,
    };
  });
}

/**
 * Lo que pinta la barra de revisión, con lo marcado (`sin` = lo desmarcado). La magnitud mide la
 * propuesta ENTERA —todo lo que se puede aplicar—, igual que la franja de antes: es la que decide
 * si «Aplicar todo» pide confirmación.
 * Desde E2a: la estructura se numera 1..k en `items` y las tareas van en `grupos` (k+1…), uno por fase.
 */
export function resumir(
  vivo: Vivo,
  borrador: Borrador,
  sin: Iterable<string> = [],
  { tareas = null }: { tareas?: EstadoDeLasTareas | null } = {},
): ResumenDelBorrador {
  const sinLista = [...sin];
  const plan = planDeAplicacion(vivo, borrador, sinLista, { tareas });
  const nuevas = new Map(
    borrador.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva").map((c) => [c.clave, c]),
  );
  const numeroEnLaLista = new Map<string, number>();
  const items: ItemDeLaLista[] = plan.items.flatMap((it) => {
    const c = it.cambio;
    if (esCambioDeTarea(c)) return [];
    const numero = numeroEnLaLista.size + 1;
    numeroEnLaLista.set(c.clave, numero);
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
    return [
      {
        numero,
        clave: c.clave,
        estado: it.estado,
        titulo: tituloDe(c, vivo, nuevas),
        detalle,
        ...(motivo ? { motivo } : {}),
        ...(aviso ? { aviso } : {}),
      },
    ];
  });
  const grupos = gruposDeTareas(vivo, borrador, plan, numeroEnLaLista, items.length);

  const proyeccion = proyectarConPlan(vivo, plan);
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
  const escritas = plan.escrituras.tareas;

  return {
    origen: borrador.origen,
    observaciones: borrador.observaciones,
    items,
    grupos,
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
    tareas: { nuevas: escritas.nuevas.length, seVan: escritas.seVan.length },
    borraAlgo: escritas.seVan.length > 0,
    fasesNuevasConTareas: escritas.nuevas.some((n) => n.fase.tipo === "nueva"),
    faltanTareas: tareas === "faltan" || tareas === "fallo",
    estadoDeTareas: tareas,
    proyeccion,
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

/** El chat no aplica mientras el cronograma espera a la IA o aplica otra cosa (2026-09-24): lo que
 *  escribiera en ese rato quedaría debajo de una propuesta calculada sobre la versión anterior. El
 *  acuerdo sigue en el chat para aplicarlo después. `rotulo` es el de la franja de espera. */
export const esperaEnCurso = (rotulo: string) =>
  `El cronograma está ocupado (${rotulo}). Espera a que termine y vuelve a aplicar: el acuerdo sigue acá.`;

/** La línea fija de la barra: lo que pasa con el cliente mientras la propuesta espera. Corta a
 *  propósito (2026-09-24, «hay mucho texto»): va en la misma línea que el cierre. */
export const LINEA_DEL_CLIENTE = "El cliente no ve estos cambios hasta que apliques.";
/** «Subir al cliente» queda libre con una propuesta abierta, con este aviso (respuesta 4 de Elías). */
export const AVISO_SUBIR_CON_PROPUESTA =
  "Hay una propuesta del cronograma sin aplicar (arriba del Gantt): si subes ahora, el cliente ve el cronograma sin esos cambios.";
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
export function pideConfirmacion(
  r: Pick<ResumenDelBorrador, "marcadas" | "magnitudDeLoMarcado" | "borraAlgo" | "faltanTareas">,
): boolean {
  /* E2a: también cuando aplicar QUITA tareas (una sola alcanza) o cuando las tareas no llegaron y
     se aplican solo las fases: las dos cosas cambian lo que el CSE cree que va a pasar. */
  return r.marcadas > 0 && (r.magnitudDeLoMarcado.esCronogramaNuevo || r.borraAlgo || r.faltanTareas);
}

/**
 * El título de la barra: «La IA propone 3 cambios de fases y 41 de tareas», solo tareas, o el de E1
 * cuando no hay tareas. Cuenta lo que todavía difiere de lo vivo (sin lo que ya está así).
 */
export function tituloDeLaBarra(r: Pick<ResumenDelBorrador, "items" | "grupos" | "magnitud">): string {
  const fases = r.items.filter((it) => it.estado !== "ya-esta").length;
  const tareas = r.grupos.reduce((n, g) => n + g.nuevas + g.seVan, 0);
  const otro = r.magnitud.esCronogramaNuevo ? "otro cronograma · " : "";
  if (tareas === 0) return `La IA propone ${otro}${plural(fases, "cambio", "cambios")}`;
  if (fases === 0) return `La IA propone ${otro}${plural(tareas, "cambio de tareas", "cambios de tareas")}`;
  return `La IA propone ${otro}${plural(fases, "cambio de fases", "cambios de fases")} y ${tareas} de tareas`;
}

/** Lo que dice la confirmación de aplicar, después del resumen de lo marcado. */
export function textoDeLaConfirmacion(
  r: Pick<ResumenDelBorrador, "borraAlgo" | "faltanTareas" | "tareas" | "fasesNuevasConTareas">,
): string {
  if (r.borraAlgo) {
    /* Sin el número: cuántas se quitan ya lo dice la primera oración (`resumenDeLaConfirmacion`).
       Cierre de la revisión de E2a: la confirmación lo repetía dos veces seguidas. */
    return (
      "Solo se quitan tareas pendientes de la IA: lo que tiene avance o escribiste a mano no se toca. " +
      "Después puedes seguir editando el cronograma a mano."
    );
  }
  if (r.faltanTareas) return "Se aplican solo los cambios de fases: las tareas de esta propuesta no llegaron.";
  return (
    "No se borra ninguna fase ni ninguna tarea: las tareas y sus estados quedan como están, y las fases nuevas " +
    `nacen ${r.fasesNuevasConTareas ? "con sus tareas" : "vacías"}. Después puedes seguir editando el cronograma a mano.`
  );
}

/**
 * La PRIMERA oración de la confirmación de aplicar: cuántos cambios van y cuáles, con las fases y las
 * tareas contadas por separado («…: se suman 2 fases nuevas, se crean 34 tareas y se quitan 9.»).
 * Revisión de E2a: se armaba solo con las frases de fases, así que una propuesta solo de tareas decía
 * «de una sola vez: .» y las tareas que se crean no aparecían en ningún lado. Sin ninguna frase, la
 * oración termina sin los dos puntos.
 */
export function resumenDeLaConfirmacion(
  r: Pick<ResumenDelBorrador, "marcadas" | "magnitudDeLoMarcado" | "tareas">,
): string {
  const frases = frasesDeCambios(r.magnitudDeLoMarcado);
  const { nuevas, seVan } = r.tareas;
  if (nuevas > 0) frases.push(`se ${nuevas === 1 ? "crea" : "crean"} ${plural(nuevas, "tarea", "tareas")}`);
  if (seVan > 0) {
    const verbo = seVan === 1 ? "quita" : "quitan";
    frases.push(nuevas > 0 ? `se ${verbo} ${seVan}` : `se ${verbo} ${plural(seVan, "tarea", "tareas")}`);
  }
  const cuantos = r.marcadas === 1 ? "aplica el cambio marcado" : `aplican los ${r.marcadas} cambios marcados`;
  return `Se ${cuantos} de una sola vez${frases.length > 0 ? `: ${unirFrases(frases)}` : ""}.`;
}

export const ACCION_ARMAR_TAREAS = "Armar las tareas";
export const ACCION_VOLVER_A_INTENTAR = "Volver a intentar";

/**
 * ¿La lista trae algún cambio de fases que se pueda aplicar sin las tareas? Lo que se puede MARCAR
 * (aplica o desmarcado), no un «ya está» ni un choque: es la misma cuenta que `aplicables`. Decide si
 * la línea de las tareas promete «solo se aplican los cambios de fases». Cierre de la revisión de E2a:
 * la barra contaba cualquier renglón, y con todo «ya está» o en choque lo prometía sin ninguno.
 */
export function hayCambiosDeFasesAplicables(items: ReadonlyArray<Pick<ItemDeLaLista, "estado">>): boolean {
  return items.some((it) => it.estado === "aplica" || it.estado === "excluido");
}

/**
 * La línea de las tareas arriba del Gantt (dentro de la barra, o suelta si no hay barra). `fase` es
 * la fase de la corrida («Leyendo las reuniones…»); `motivo`, por qué falló. null = no hay línea.
 * `conCambiosDeFases`: la propuesta trae cambios de fases que se pueden aplicar sin las tareas. Sin
 * ellos (el borrador que nace vacío cuando el paso 1 no propuso nada), «Si aplicas ahora, solo se
 * aplican los cambios de fases» es falso: no hay ninguno (revisión de E2a).
 */
export function textoDeLaLineaDeTareas(
  estado: EstadoDeLasTareas | "paso-1" | null,
  fase: string | null,
  motivo: string | null,
  conMaterial: boolean,
  conCambiosDeFases = true,
): { texto: string; accion: string | null } | null {
  const siAplicas = conCambiosDeFases ? " Si aplicas ahora, solo se aplican los cambios de fases." : "";
  switch (estado) {
    case "paso-1":
      return {
        texto: conMaterial
          ? "Paso 1 de 2 · Revisando fases y tiempos con tus reuniones, notas e instrucciones…"
          : "Preparando la propuesta del cronograma…",
        accion: null,
      };
    case "armando":
      return { texto: `Armando las tareas… · ${fase?.trim() || "suele tardar uno o dos minutos"}`, accion: null };
    case "faltan":
      return {
        texto: conCambiosDeFases
          ? "Faltan las tareas de esta propuesta: si aplicas ahora, solo se aplican los cambios de fases."
          : "Faltan las tareas de esta propuesta.",
        accion: ACCION_ARMAR_TAREAS,
      };
    case "fallo": {
      const m = motivo?.trim().replace(/[.\s]+$/, "");
      return {
        texto: `No se pudieron armar las tareas${m ? `: ${m}` : ""}.${siAplicas}`,
        accion: ACCION_VOLVER_A_INTENTAR,
      };
    }
    default:
      return null;
  }
}

/**
 * La oferta de armar las tareas después de resolver una propuesta que no las trajo («faltan» o
 * «fallo»). Con cambios de fases, las fases quedaron decididas y falta el paso 2. Sin ellos (el
 * borrador vacío cuya corrida falló) no se decidió ninguna fase: afirmarlo era falso (revisión de
 * E2a). La pantalla la usa en `PasoDeTareasPendiente`.
 */
export function textoDeLaOfertaDeTareas(conCambiosDeFases: boolean): { titulo: string; detalle: string } {
  return conCambiosDeFases
    ? { titulo: "Las fases quedaron decididas.", detalle: "Falta el paso 2: las tareas sobre esta estructura." }
    : { titulo: "No se pudieron armar las tareas.", detalle: "¿Volver a intentar?" };
}

/**
 * El chip del encabezado mientras la IA trabaja: lo mismo que la línea de arriba del Gantt. «Revisando
 * fases y tiempos…» SOLO con material elegido: sin él, el paso 1 no revisa nada (vuelve «sin-material»).
 * Revisión de E2a: el chip lo decía siempre, y la línea de al lado decía otra cosa.
 */
export function textoDelChipDeEspera(enElPaso1: boolean, conMaterial: boolean): string {
  if (!enElPaso1) return "Armando las tareas…";
  return conMaterial ? "Revisando fases y tiempos…" : "Preparando la propuesta…";
}

/** ¿La propuesta guardada trae algún cambio de fases (o de fecha de arranque, u orden)? El handoff y el
 *  formato viejo son solo de fases: sí. El borrador vacío del paso 2, o uno solo de tareas: no. */
export function traeCambiosDeFases(json: unknown): boolean {
  if (!esBorradorV1(json)) return json != null;
  return (
    Array.isArray(json.cambios) &&
    json.cambios.some((c) => esObjeto(c) && !(typeof c.tipo === "string" && c.tipo.startsWith("tarea-")))
  );
}

/* Los techos de lo que notó el paso 1 al viajar en el pedido del paso 2: los mismos que valida
   `leerPedidoDeTareas` (lib/timeline/borrador-del-detalle.ts, server-only). Un test los ata. */
const MAX_OBSERVACIONES_DEL_PASO_1 = 20;
const MAX_LARGO_DE_OBSERVACION = 1000;

/**
 * Lo que notó el paso 1, listo para el pedido del paso 2 con token null: el borrador vacío nace con
 * ellas, así la barra las muestra y sobreviven a recargar o a descartar (revisión de E2a). Textos
 * limpios, sin repetidos y dentro de los techos de la ruta (si no, el pedido entero daría 400).
 */
export function observacionesParaElPaso2(obs: unknown): string[] {
  if (!Array.isArray(obs)) return [];
  const limpias = obs
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, MAX_LARGO_DE_OBSERVACION))
    .filter((o) => o.length > 0);
  return [...new Set(limpias)].slice(0, MAX_OBSERVACIONES_DEL_PASO_1);
}

/**
 * Lo que notó la IA, de dos fuentes, sin repetir y en orden. Al resolver una propuesta, lo que notó el
 * paso 1 se JUNTA con lo de la propuesta, no se reemplaza: el borrador vacío del paso 2 podía traer una
 * lista vacía, y descartarlo dejaba sin nada la franja «La IA también notó» que el aviso acababa de
 * prometer (revisión de E2a).
 */
export function juntarObservaciones(delPaso1: readonly string[], deLaPropuesta: readonly string[]): string[] {
  return [...new Set([...delPaso1, ...deLaPropuesta].map((o) => o.trim()).filter((o) => o.length > 0))];
}

/**
 * Lo que muestra la franja «La IA también notó» (sin barra que lo muestre: sin propuesta, o con el
 * borrador VACÍO que espera sus tareas). Puro. Lo del paso 1 que guarda la pantalla, JUNTO con lo que
 * guardó el borrador vacío en pantalla. Cierre de la revisión de E2a: vivía solo en la memoria de la
 * pantalla, y al recargar con el vacío «armando» no se veía en ningún lado. `cerradaLaDelGuardado`: el
 * CSE ya cerró la franja de ese borrador (lo guardado no se borra al cerrarla).
 */
export function observacionesDeLaFranja(i: {
  delPaso1: readonly string[];
  /** La propuesta guardada en pantalla, o null. */
  guardado: unknown;
  cerradaLaDelGuardado: boolean;
}): string[] {
  const guardadas =
    !i.cerradaLaDelGuardado && esVacioEsperandoTareas(i.guardado) && Array.isArray((i.guardado as Record<string, unknown>).observaciones)
      ? ((i.guardado as Record<string, unknown>).observaciones as unknown[]).filter((o): o is string => typeof o === "string")
      : [];
  return juntarObservaciones(i.delPaso1, guardadas);
}

export const AVISO_TAREAS_LISTAS = "Listas las tareas de la propuesta: revísala arriba del Gantt.";
/** Las tareas llegaron con la vista previa del modificador en pantalla: la barra no se ve hasta descartarla. */
export const AVISO_TAREAS_LISTAS_CON_VISTA_PREVIA =
  "Listas las tareas de la propuesta: descarta la vista previa para revisarla arriba del Gantt.";
export const AVISO_DETALLE_SIN_CAMBIOS = "La IA terminó y no propone cambios del cronograma.";
/** El chat no aplica con el borrador VACÍO cuya corrida falló: nadie va a traer nada, hay que sacarlo. */
export const CHAT_CON_EL_VACIO_FALLIDO =
  "No se pudieron armar las tareas del cronograma. Descarta la propuesta vacía arriba del Gantt y vuelve a aplicar: el acuerdo sigue acá.";

/** Lo que dijo el GET del cronograma al releer la propuesta, después de seguir la corrida de sus tareas. */
export interface LecturaTrasLaCorrida {
  /** Hay una propuesta guardada, del formato que sea. */
  hayPropuesta: boolean;
  /** Las tareas del `borrador-v1` guardado (su corrida, su estado y por qué fallaron), o null si no espera. */
  tareas: { corrida: string | null; estado: EstadoDeLasTareas; motivo: string | null } | null;
}

export type DesenlaceDelSeguimiento =
  /** Todavía no se sabe (sigue armando, o el GET falló): se vuelve a seguir, sin avisar ni darla por avisada. */
  | { que: "seguir" }
  /** La propuesta guardada ya no es la de esta corrida (se descartó o la reemplazó otra): nada que avisar. */
  | { que: "callar" }
  | { que: "avisar"; ok: boolean; tono: "exito" | "info" | "error"; texto: string };

const pareceUnCodigo = (t: string) => /^[A-Z][A-Z0-9_]+$/.test(t);

/**
 * Qué hace la pantalla cuando termina de seguir la corrida que arma las tareas. Puro. Revisión de E2a:
 *   · El GET falló (`lectura` null): no se sabe nada, así que no se avisa («no propone cambios» era
 *     falso) y se vuelve a intentar.
 *   · La guardada es la de esta corrida: se dice lo que el GET calculó. «listas» → que se revise;
 *     «fallo» → la misma frase de la línea, con la causa en palabras del CSE (nunca el código de la
 *     corrida); «armando» → se sigue. Así también se avisa UNA vez cuando una corrida colgada pasa a
 *     «fallo» (el seguimiento se rinde a los ~6 min, y la corrida se da por muerta a los 30).
 *   · La guardada es OTRA: se refresca en silencio.
 *   · No hay ninguna: un ERROR es la corrida de una propuesta que se descartó (se calla); un DONE es
 *     el paso 2 que no encontró nada que cambiar y borró el borrador vacío, así que se dice lo que
 *     dejó la corrida (o que no propone cambios).
 * El descarte hecho en ESTA pantalla lo calla quien descarta, antes de que la corrida termine.
 */
export function desenlaceDelSeguimiento(i: {
  corrida: string;
  estado: "DONE" | "ERROR" | "TIMEOUT";
  lectura: LecturaTrasLaCorrida | null;
  /** Lo que dejó dicho la corrida al terminar sin tareas (`timelineSyncError`). */
  aviso?: string | null;
  /** En pantalla está la vista previa del modificador: la guardada se LEYÓ sin ponerla (cierre de la
   *  revisión de E2a: el seguimiento callaba y daba la corrida por avisada). */
  conVistaPrevia?: boolean;
}): DesenlaceDelSeguimiento {
  if (i.lectura === null) return { que: "seguir" };
  const t = i.lectura.tareas;
  if (t !== null && t.corrida === i.corrida) {
    if (t.estado === "armando") return { que: "seguir" };
    if (t.estado === "listas") {
      return { que: "avisar", ok: true, tono: "exito", texto: i.conVistaPrevia ? AVISO_TAREAS_LISTAS_CON_VISTA_PREVIA : AVISO_TAREAS_LISTAS };
    }
    if (t.estado === "fallo") {
      const texto = textoDeLaLineaDeTareas("fallo", null, t.motivo, false, false)?.texto ?? "No se pudieron armar las tareas.";
      return { que: "avisar", ok: false, tono: "error", texto };
    }
    return { que: "callar" };
  }
  if (i.lectura.hayPropuesta || i.estado !== "DONE") return { que: "callar" };
  const aviso = i.aviso?.trim() ?? "";
  return {
    que: "avisar",
    ok: true,
    tono: "info",
    texto: aviso.length > 0 && !pareceUnCodigo(aviso) ? aviso : AVISO_DETALLE_SIN_CAMBIOS,
  };
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
  "Mientras la IA trabajaba entró una propuesta del cronograma que nadie decidió todavía, y no se aplica nada encima de ella. Descarta esta vista previa para verla arriba del Gantt; cuando la resuelvas, vuelve a pedir el cambio.";

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

/**
 * La identidad de lo que hay guardado: token + contenido. null si no es un borrador.
 *
 * ⚠ El contenido se mide con las claves ORDENADAS (`jsonCanonico`), no con `JSON.stringify` crudo.
 * La misma propuesta llega con otro orden de claves según el camino: la respuesta del POST
 * /estructura trae el orden en que la armó `construirPropuestaDeEstructura`, y el GET del cronograma
 * el que devuelve Postgres para un jsonb. Con el texto crudo eran dos «propuestas distintas»: al
 * recargar se perdía la foto recordada y una edición a mano que chocaba pasaba a «aplica»
 * (revisión de E1, 2026-09-24 — el caso del video de Wherex).
 */
export function claveDeRevision(json: unknown, token: string | null): string | null {
  if (!esBorradorGuardado(json)) return null;
  /* E2a: un v1 trae su `desde` y sube `version` en cada escritura (la marca y la fusión de las
     tareas). Su identidad es el TOKEN: lo desmarcado sobrevive a que lleguen las tareas. */
  if (esBorradorV1(json)) return `${token ?? ""}|v1`;
  return `${token ?? ""}|${huellaDeTexto(jsonCanonico(json))}`;
}

/** JSON con las claves de cada objeto ordenadas: el mismo contenido da siempre el mismo texto. */
export function jsonCanonico(v: unknown): string {
  return JSON.stringify(v, (_k, valor: unknown) =>
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : valor,
  );
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
  return marcarCambios(e, [clave], incluir);
}

/**
 * Marca o desmarca VARIOS cambios de una vez: la casilla de un grupo de tareas (todas las de una
 * fase). Un solo estado nuevo, no N: lo desmarcado se recuerda una vez, y la lista no pinta un
 * estado a medias. Sin claves, devuelve el mismo estado (nada que recordar).
 */
export function marcarCambios(e: EstadoDeRevision, claves: readonly string[], incluir: boolean): EstadoDeRevision {
  if (claves.length === 0) return e;
  const sin = new Set(e.sin);
  for (const clave of claves) {
    if (incluir) sin.delete(clave);
    else sin.add(clave);
  }
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
