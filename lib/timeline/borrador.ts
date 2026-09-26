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
 * ── E1–E4: LO GUARDADO ES SIEMPRE `borrador-v1` ──────────────────────────────
 * Los cuatro tipos de fases: fecha de arranque, orden, fase nueva y fase que cambia (un cambio por
 * CAMPO). Desde E4 (2026-09) lo guardado en `pendingProposal` es siempre `borrador-v1`: el lector no
 * conoce otro formato (`leerBorrador` da null) y la pantalla ofrece descartar lo que no sabe leer.
 * Las propuestas viejas que seguían abiertas se convierten una vez, JUSTO DESPUÉS del deploy de E4 (todo main
 * junto), con `scripts/propuestas-abiertas.ts --convertir-viejas`, el único que todavía conoce ese formato;
 * después, `--antes-de-e4` tiene que dar verde. En ese rato se ven como «no se sabe leer»: descartarlas pide
 * confirmación y deja una copia (DELETE /timeline/proposal).
 * `ProposalLike` (lib/timeline/proposal-deltas.ts) queda solo como lo que arman el handoff y el paso 1
 * de «Regenerar todo» ANTES de convertirse, UNA vez, con `convertirPropuestaDeFases`: fija cada
 * `desde` contra lo que leyó quien la produjo, y nunca se guarda así.
 * Dos cosas del handoff se saben sin mirar lo que leyó, por cómo lo arma analyze (reconcile-proposal.ts):
 *   · la FECHA DE ARRANQUE solo la propone cuando el proyecto no tenía (`existente ?? kickoff`): su
 *     `desde` es siempre null, y una fecha que hoy puso una persona choca;
 *   · el TIPO de actividad lo copia tal cual de la fase existente: nunca es un cambio que proponga,
 *     así que una diferencia es una edición humana posterior y no se revierte.
 * Por eso la conversión aplicada entera da lo mismo que la vieja `apply-items` salvo en esos dos
 * casos, y los dos son a propósito (lib/timeline/borrador.test.ts, «paridad»).
 *
 * ── E2a: «REGENERAR TODO» DEJA UN SOLO BORRADOR, CON FASES Y TAREAS ───────────
 * Nace el formato `borrador-v1` escrito de verdad (lo escriben /estructura y /analyze) y dos tipos
 * de cambio de TAREA: `tarea-nueva` y `tarea-se-va`. Un tipo que esta versión no conoce (por ejemplo
 * `tarea-se-muda`) se lee como DESCONOCIDO y bloquea.
 *   · El estado de las tareas no se guarda como máquina de estados: se DEDUCE de la corrida del
 *     paso 2 (`estadoDeLasTareas`). Aplicar se bloquea solo mientras la corrida está viva.
 *   · Las tareas de una fase valen si la fase, como quedaría, conserva el nombre y las semanas con
 *     que se armaron (`tareasArmadasPara`): es el cierre de dependencias del plan (§2.1, paso 6).
 *   · Lo que tiene avance o se escribió a mano (`isKept`) nunca se quita, y una tarea que se va
 *     choca si alguien la editó (título, semana, notas, dueño, tipo o fechas fijadas) después.
 * El núcleo es puro: la pantalla y el servidor evalúan con la misma función y las mismas tareas
 * (solo lo que viaja en el cable, sin `order` ni fechas reales).
 *
 * ── E2b: «REGENERAR» DE UNA FASE ES EL MISMO BORRADOR, CON `soloFase` ─────────
 * Mismo origen («contexto») y mismo camino que el paso 2 de «Regenerar todo»; `soloFase` acota las
 * tareas a esa fase. De dónde viene una propuesta lo dice UNA sola clasificación (`deDondeViene`).
 *
 * ── E2c: LA FASE DESFASADA Y SU RECÁLCULO ────────────────────────────────────
 * Las tareas se arman para una FORMA de la fase (`FormaDeFase`: nombre, semanas y, desde E2c, sesiones
 * y si es la primera, la de la Semana 0). Si con lo marcado la fase ya no tiene esa forma y cada
 * diferencia la explican las casillas del CSE (no una edición a mano), la fase está DESFASADA: sus
 * tareas se recalculan en vez de quedar fuera con su cambio. La marca del recálculo va en `recalculo`,
 * nunca en `tareas` (el estado se deduce de su corrida, igual que el de las tareas).
 * Desde P3 (el interruptor), sus tareas ya no quedan fuera «con» el cambio desmarcado: quedan en
 * espera, sin `dependeDe`, y aplicar se bloquea hasta que se recalculen, se desmarquen o se fuercen.
 *
 * ── E3: LO QUE DICTA EL CHAT ─────────────────────────────────────────────────
 * Dos tipos más, que solo produce el chat:
 *   · `tarea-cambia`: renombra, cambia de semana, de dueño o de tipo, o MUDA una tarea (`a.fase`) y
 *     conserva su id, su estado y sus fechas. Una sola fila por tarea: mudarla y renombrarla es UN
 *     cambio (aplicar solo la mitad dejaría estados a medias).
 *   · `fase-se-va`: quita una fase. Lo que tiene avance, se cargó a mano, se creó o se editó después
 *     del cambio (la foto por tarea) se queda, y la fase con ello (`ItemDelPlan.rescate`).
 * `porChat` marca lo que dictó el chat (en los 8 tipos) y `retocada` una tarea nueva de la IA que el
 * chat editó. Deciden el permiso (`necesitaPermisoDeIa`), el `source` con que nace o queda lo escrito
 * y que el cierre de E2c no los mire. Una tarea nueva de la IA que el chat MUDA de fase sigue siendo de
 * la IA (su vara, su «por validar»): va `retocada` y `mudadaPorElChat`, y esta última es la que la saca
 * del cierre (revisión de E3). `excluidos` (las casillas guardadas) y `ajustadasPorElChat` (la
 * forma que el chat le dio a una fase armada, D9) viajan en el JSON; el plan NUNCA lee `excluidos`:
 * quien llama pasa `sin`.
 */
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

/** El dueño y el tipo de una tarea, como los guarda la base. */
export type Party = "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV";
export type TipoDeTarea = "SESSION" | "TASK";

/**
 * El título normalizado (sin mayúsculas, sin tildes y con un solo espacio): la llave con que se
 * reconoce una tarea MUDADA de fase o repetida. E4 (2026-09): vivía con el diff por ítem de «Pedir
 * cambio con IA», que se retiró; el rango es el de los acentos combinantes que deja `normalize("NFD")`.
 */
export function huellaDeTitulo(titulo: string): string {
  return titulo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

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

/** Una fase del cronograma vivo (o de lo que leyó un productor, `base`), en su orden. */
export interface FaseViva {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  /** Sus tareas, en su orden (semana y `order`). `undefined` = no se leyeron (el handoff): una tarea
   *  que se va choca, que es la dirección segura. */
  tareas?: TareaDelVivo[];
  /** E3: el estado de la fase (PENDING, IN_PROGRESS…). `undefined` = no se leyó: una fase que se va
   *  choca. Lo tienen igual la pantalla y el servidor (si no, la huella difiere). */
  status?: string;
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

/**
 * E3: lo que dictó el chat. Decide el permiso para aplicar (la vara de editar, no la de la IA), el
 * `source` con que nace o queda lo escrito, que el cierre de E2c no lo mire y que las fusiones de la
 * IA no lo borren. Ausente = de la IA (todo lo anterior a E3).
 */
interface DelChat {
  porChat?: true;
}

export interface CambioDeAncla extends DelChat {
  tipo: "ancla";
  clave: "ancla";
  /** YYYY-MM-DD o null (el proyecto no tenía). */
  desde: string | null;
  a: string;
}
export interface CambioDeOrden extends DelChat {
  tipo: "orden";
  clave: "orden";
  /** El orden COMPLETO de las fases cuando se armó. Si hoy es otro (se reordenó, se sumó o se borró una), choca. */
  desde: string[];
  /** Las fases que la propuesta ordena, en su orden. Las que no nombra quedan detrás, en el suyo. */
  a: string[];
  motivos?: string[];
}
export interface CambioFaseNueva extends DelChat {
  tipo: "fase-nueva";
  clave: string;
  fase: FaseNuevaPropuesta;
  /** Detrás de qué va: el id de una fase existente, la clave de otra fase nueva, o null (al principio).
   *  Si esa otra fase nueva no se aplica, se sigue su propio `despuesDe`. */
  despuesDe: string | null;
  motivo?: string;
}
export interface CambioFaseCambia extends DelChat {
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

/** E3: cómo estaba una fase que se va cuando se armó el cambio (los 6 campos y su estado). */
export interface FotoDeFase {
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  status: string;
}
/**
 * E3: una fase que se quita (solo la produce el chat). Lo que tiene avance o se cargó a mano, lo
 * creado después y lo editado después (la foto por tarea) se queda, y la fase con ello. La fase
 * entera choca si se editó cualquier campo suyo después, o si ya arrancó.
 */
export interface CambioFaseSeVa extends DelChat {
  tipo: "fase-se-va";
  clave: string;
  faseId: string;
  desde: FotoDeFase & { tareas: Array<{ id: string; foto: FotoDeTarea }> };
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
export interface CambioTareaNueva extends DelChat {
  tipo: "tarea-nueva";
  clave: string;
  /** Su fase: el id de una existente o la clave (`n:…`) de una fase nueva del mismo borrador. */
  fase: string;
  tarea: ContenidoDeTareaNueva;
  motivo?: string;
  /** E3: una tarea nueva de la IA que el chat editó: nace MODIFIED y la aplica la vara de la IA. */
  retocada?: true;
  /**
   * E3 (revisión): una tarea nueva de la IA que el chat mudó a OTRA fase. Sigue siendo de la IA (pide su
   * vara y conserva «por validar»), va `retocada` y no entra al cierre de E2c: ya no es de la forma para
   * la que se armó (chocaría en una fase sin forma armada). Como lo del chat, solo sigue a su fase.
   */
  mudadaPorElChat?: true;
}
/** Una tarea pendiente de la IA que se quita. Se identifica por su id; su `desde` es la foto que LEYÓ
 *  quien lo produjo (E2b, D10): lo que alguien edite después, aunque sea mientras la IA arma, choca. */
export interface CambioTareaSeVa extends DelChat {
  tipo: "tarea-se-va";
  clave: string;
  tareaId: string;
  faseId: string;
  desde: FotoDeTarea;
  motivo?: string;
}
/** E3: los campos de una tarea que el chat puede cambiar (el orden es el de las frases). */
export type CampoDeTarea = "title" | "weekIndex" | "party" | "type";
export const CAMPOS_DE_TAREA: readonly CampoDeTarea[] = ["weekIndex", "title", "party", "type"];
/**
 * E3: una tarea viva que cambia (solo la produce el chat). Renombrarla, cambiarle la semana, el dueño
 * o el tipo, o mudarla (`a.fase`): conserva su id, su estado y sus fechas. Se comparan SOLO los campos
 * de `a` (y la fase): lo que nadie pidió cambiar puede editarse a mano sin chocar.
 */
export interface CambioTareaCambia extends DelChat {
  tipo: "tarea-cambia";
  clave: string;
  tareaId: string;
  /** Donde estaba al crearse el cambio (el origen). */
  faseId: string;
  desde: FotoDeTarea;
  /** `fase`: el id de una existente o la clave `n:…` de una fase nueva del mismo borrador. */
  a: { title?: string; weekIndex?: number; party?: Party | null; type?: TipoDeTarea | null; fase?: string };
  /** D17: la clave del cambio de duración con el que va (quitar o insertar una semana). Si ese cambio
   *  queda fuera, esta tarea también. */
  conCambio?: string;
  motivo?: string;
}
export type CambioDeTarea = CambioTareaNueva | CambioTareaSeVa | CambioTareaCambia;
export type CambioDeEstructura = CambioDeAncla | CambioDeOrden | CambioFaseNueva | CambioFaseCambia | CambioFaseSeVa;
export type Cambio = CambioDeEstructura | CambioDeTarea;

export const esCambioDeTarea = (c: Cambio): c is CambioDeTarea =>
  c.tipo === "tarea-nueva" || c.tipo === "tarea-se-va" || c.tipo === "tarea-cambia";

/**
 * E3: ¿aplicar este cambio pide la vara de la IA (`guardIaDelCronograma`)? Las tareas y las fases que
 * se van, salvo que las haya dictado el chat: lo del chat pide la de editar el cronograma, como hoy
 * el PUT del chat.
 */
export const necesitaPermisoDeIa = (c: Cambio): boolean =>
  (esCambioDeTarea(c) || c.tipo === "fase-se-va") && !c.porChat;

export type OrigenDelBorrador = "handoff" | "contexto";

/** Quién pidió el borrador: «Regenerar todo» (ya había tareas de la IA) o «Generar cronograma». */
export type PedidoDelBorrador = "regenerar" | "primera";
/** La corrida del paso 2 que arma (o armó) las tareas, y si ya se fusionaron. */
export interface TareasDelBorrador {
  corrida: string | null;
  listas: boolean;
}
export type EstadoDeLasTareas = "listas" | "faltan" | "armando" | "fallo";

/**
 * La forma de una fase para la que se armaron sus tareas (E2c, D3). `sesiones` y `semanaCero` son
 * opcionales: un borrador anterior no los trae, y lo que no trae no se compara (no cambia nada).
 */
export interface FormaDeFase {
  nombre: string;
  semanas: number;
  sesiones?: number | null;
  /** Es la primera fase de la estructura: la de la Semana 0 (las tareas fijas del arranque). */
  semanaCero?: boolean;
}

/**
 * El recálculo de las tareas de las fases desfasadas (E2c, D5). Va aparte de `tareas`: ahí un fallo
 * se leería como «faltan todas». Su estado se DEDUCE de la corrida, como el de las tareas.
 */
export interface RecalculoDelBorrador {
  corrida: string;
  /** Las que se pidieron; tras un fallo parcial, las que fallaron. */
  fases: Array<{ id: string; nombre: string }>;
  /** Solo las claves de ESTRUCTURA desmarcadas al pedirlo: rehacen la estructura que vio el agente. */
  sin: string[];
  /** Solo tras un fallo parcial: por qué. */
  motivo?: string | null;
}

/** Una fase cuyas tareas se armaron para otra forma, y con lo marcado tienen que recalcularse. */
export interface FaseDesfasada {
  fase: string;
  /** El nombre con lo marcado (el que queda). */
  nombre: string;
  /** La forma con lo marcado. */
  forma: FormaDeFase;
  /** La forma para la que se armaron sus tareas. */
  armada: FormaDeFase;
}

/** El recálculo como viaja en el GET (dentro de `tareasDelBorrador`), con su estado deducido. */
export interface RecalculoEnElCable {
  estado: "armando" | "fallo";
  corrida: string;
  /** Los ids de las fases del recálculo. */
  fases: string[];
  /** Sus nombres, en el mismo orden. */
  nombres: string[];
  /** La fase de la corrida («Leyendo las reuniones»), solo en «armando». */
  fase: string | null;
  /** Por qué falló, solo en «fallo». */
  motivo: string | null;
}

export interface Borrador {
  formato: typeof FORMATO_BORRADOR;
  /** Cuenta las ediciones del borrador. Recién convertido por un productor: 0. */
  version: number;
  origen: OrigenDelBorrador;
  /** Lo que la IA notó y no se aplica solo (interno). */
  observaciones: string[];
  cambios: Cambio[];
  /** Solo al LEER un `borrador-v1`: cuántos cambios son de un tipo que esta versión no sabe aplicar.
   *  Nunca se guarda. */
  desconocidos?: number;
  /** El handoff: null. */
  pedido: PedidoDelBorrador | null;
  /** null = no espera tareas (el handoff). */
  tareas: TareasDelBorrador | null;
  /** Por fase (id real o `n:…`): la forma para la que se armaron sus tareas. */
  tareasArmadasPara: Record<string, FormaDeFase>;
  /**
   * E2b: «Regenerar» de UNA fase (su id). Ausente = todo el cronograma. Sigue siendo origen
   * «contexto» con el pedido de `pedidoDelCronograma`: no es un origen nuevo (una vuelta atrás lo
   * leería como handoff). El alcance de la fusión sale SIEMPRE de acá, del JSON guardado, nunca
   * del body del pedido.
   */
  soloFase?: string;
  /** E2c: el recálculo de las fases desfasadas (ausente = no hay). Metadata del servidor. */
  recalculo?: RecalculoDelBorrador;
  /**
   * E3: las casillas desmarcadas, guardadas en el servidor (las ve cualquier computadora). El plan
   * NUNCA las lee: quien llama pasa `sin`. Ausente = nadie las guardó todavía.
   */
  excluidos?: string[];
  /**
   * E3 (D9): la forma de una fase ARMADA después de que el chat le cambió el nombre, las semanas o
   * las sesiones. No pisa `tareasArmadasPara`: el cierre acepta cualquiera de las dos, así desmarcar
   * el cambio del chat vuelve a la armada sin recalcular.
   */
  ajustadasPorElChat?: Record<string, FormaDeFase>;
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
/** Solo DENTRO de la conversión de un `ProposalLike`: el productor la cambia por `n:…` antes de
 *  guardar (`conClavesDeProductor`), nunca se guarda una clave derivada de posiciones. */
export const claveDeNueva = (indice: number): string => `nueva:${indice}`;
export const claveDeTareaQueSeVa = (tareaId: string): string => `tarea:${tareaId}:se-va`;
/** E3: una sola fila por tarea que cambia (renombre, semana, dueño, tipo o mudanza). */
export const claveDeTareaQueCambia = (tareaId: string): string => `tarea:${tareaId}:cambia`;
/** E3: la fase que se va. «se-va» no es un campo, así que no choca con `claveDeCampo`. */
export const claveDeFaseQueSeVa = (faseId: string): string => `fase:${faseId}:se-va`;
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
// ── CONVERTIR lo que arman los productores, y LEER lo guardado ───────────────
// ─────────────────────────────────────────────────────────────────────────────

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

/** Detrás de qué va la fase nueva `i`: la entrada ANTERIOR de la propuesta que existe en `base`
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
 * LO QUE ARMA UN PRODUCTOR (`ProposalLike`) → EL BORRADOR, contra `base`: lo que leyó ese productor.
 * La usan solo `borradorBase` (el paso 1) y `convertirDelHandoff`, una vez, antes de guardar; lo
 * guardado nunca vuelve a pasar por acá (E4). Determinista: los mismos datos dan el mismo borrador.
 * Sale de `computeProposalDeltas` a propósito: los cambios son EXACTAMENTE los de la pantalla vieja,
 * con dos inferencias del handoff (arriba).
 * Orden de la lista (y de los números): arranque, orden, y después fase por fase en el orden de la
 * propuesta —cada campo en `CAMPOS_POR_IMPACTO`—.
 */
export function convertirPropuestaDeFases(p: ProposalLike, base: Vivo): Borrador {
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
  const viejo = convertirPropuestaDeFases(i.propuesta, i.vivo);
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
 * La conversión del handoff SIN el filtro de «nada aplicable»: exacta para este productor (arriba, las
 * dos inferencias). Solo fases y no espera tareas (`tareas: null`); el `desde` queda fijado contra
 * `vivo`. E4 (P3): la usa también la conversión de las propuestas viejas del handoff
 * (scripts/propuestas-abiertas.ts), contra el cronograma del día en que se crearon; ahí una propuesta
 * que solo choca no se tira, porque el CSE tiene que ver el ⚠.
 */
export function convertirDelHandoff(i: { propuesta: ProposalLike; vivo: Vivo; nuevaClave?: () => string }): Borrador {
  const viejo = convertirPropuestaDeFases(i.propuesta, i.vivo);
  return {
    ...viejo,
    version: 0,
    origen: "handoff",
    cambios: conClavesDeProductor(viejo.cambios, i.nuevaClave ?? claveAleatoria),
    pedido: null,
    tareas: null,
    tareasArmadasPara: {},
  };
}

/**
 * El borrador que deja el HANDOFF (E2b), o null si no hay nada que se pueda aplicar: un productor sin
 * cambios nunca escribe. Es `convertirDelHandoff` con ese filtro, contra `vivo`, lo que leyó el
 * servidor: los choques son los mismos en cualquier computadora. `propuesta` nunca trae `origen`.
 * No es `borradorBase` con otro origen: aquél siempre devuelve un borrador que espera tareas.
 */
export function borradorDelHandoff(i: { propuesta: ProposalLike; vivo: Vivo; nuevaClave?: () => string }): Borrador | null {
  const b = convertirDelHandoff(i);
  return planDeAplicacion(i.vivo, b).aplicables > 0 ? b : null;
}

/** El borrador que marca «armando las tareas» cuando no había propuesta de fases (0 cambios de fases).
 *  `observaciones`: lo que notó el paso 1 sin proponer (lo acordado que no entró). Van en el borrador
 *  para que la barra las muestre y sobrevivan a recargar o a descartar (revisión de E2a).
 *  `soloFase` (E2b): «Regenerar» de una fase; la clave va solo si viene. */
export function borradorVacio(i: {
  pedido: PedidoDelBorrador;
  corrida: string;
  observaciones?: readonly string[];
  soloFase?: string | null;
}): Borrador {
  return {
    formato: FORMATO_BORRADOR,
    version: 0,
    origen: "contexto",
    observaciones: [...(i.observaciones ?? [])],
    cambios: [],
    pedido: i.pedido,
    tareas: { corrida: i.corrida, listas: false },
    tareasArmadasPara: {},
    ...(i.soloFase ? { soloFase: i.soloFase } : {}),
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

/**
 * Revisión de E4 (#1): la razón del `TimelineChange` (MANUAL) que guarda la copia de una propuesta descartada sin
 * poder leerla (DELETE /timeline/proposal). Vive acá y no en la ruta (una ruta de Next solo exporta sus métodos)
 * porque la cartera la EXCLUYE de la última razón de cada cronograma (lib/portfolio/load.ts, revisión de los
 * arreglos): no es el porqué de un atraso, y tapaba la razón que el CSE escribió al guardar.
 */
export const RAZON_DESCARTE_ILEGIBLE =
  "Se descartó una propuesta guardada que esta versión no sabe leer. Su contenido queda en este registro.";

/** La versión de un `borrador-v1` guardado, o null si lo guardado no es un v1 (no hay propuesta que
 *  se sepa leer: aplicar responde 409 y la pantalla trae lo nuevo). */
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

/** Los tipos crudos que esta versión sabe leer y que piden la vara de la IA salvo que sean del chat. */
const TIPOS_CON_PERMISO_DE_IA: readonly string[] = ["tarea-nueva", "tarea-se-va", "tarea-cambia", "fase-se-va"];

/** ¿El v1 guardado trae algún cambio de tareas? Mira el tipo crudo (también uno que esta versión no
 *  conoce): decide el permiso de aplicar, y ante la duda cuenta como tocar tareas.
 *  E3: cuentan los `tarea-*` y `fase-se-va` SIN `porChat === true` (lo del chat pide la vara de
 *  editar, `necesitaPermisoDeIa`). Un `tarea-*` de un tipo que esta versión no conoce cuenta siempre. */
export function traeCambiosDeTareas(json: unknown): boolean {
  return (
    esBorradorV1(json) &&
    Array.isArray(json.cambios) &&
    json.cambios.some((c) => {
      if (!esObjeto(c) || typeof c.tipo !== "string") return false;
      if (!c.tipo.startsWith("tarea-") && c.tipo !== "fase-se-va") return false;
      return c.porChat !== true || !TIPOS_CON_PERMISO_DE_IA.includes(c.tipo);
    })
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

/**
 * E3: la foto de una fase que se va, estricta: los 6 campos con su tipo exacto y el estado. Una foto
 * a medias no vale (el cambio queda desconocido y bloquea: la dirección segura).
 */
function leerFotoDeFase(v: unknown): FotoDeFase | null {
  if (!esObjeto(v) || typeof v.name !== "string" || typeof v.durationWeeks !== "number" || typeof v.status !== "string") {
    return null;
  }
  const num = (x: unknown) => (x === null ? null : typeof x === "number" ? x : undefined);
  const txt = (x: unknown) => (x === null ? null : typeof x === "string" ? x : undefined);
  const startWeek = num(v.startWeek);
  const sessionCount = num(v.sessionCount);
  const notes = txt(v.notes);
  const activityType = txt(v.activityType);
  if (startWeek === undefined || sessionCount === undefined || notes === undefined || activityType === undefined) return null;
  return { name: v.name, durationWeeks: v.durationWeeks, startWeek, sessionCount, notes, activityType, status: v.status };
}

/** E3: el `a` de una tarea que cambia, estricto: al menos una clave, y cada una que venga, válida. */
function leerCambioDeTarea(v: unknown): CambioTareaCambia["a"] | null {
  if (!esObjeto(v)) return null;
  const a: CambioTareaCambia["a"] = {};
  if (v.title !== undefined) {
    if (!esTitulo(v.title)) return null;
    a.title = v.title;
  }
  if (v.weekIndex !== undefined) {
    if (!esSemana(v.weekIndex)) return null;
    a.weekIndex = v.weekIndex;
  }
  if (v.party !== undefined) {
    const party = leerParty(v.party);
    if (party === undefined) return null;
    a.party = party;
  }
  if (v.type !== undefined) {
    const type = leerTipoDeTarea(v.type);
    if (type === undefined) return null;
    a.type = type;
  }
  if (v.fase !== undefined) {
    if (!esTextoEntre(v.fase, 1, 200)) return null;
    a.fase = v.fase;
  }
  return Object.keys(a).length > 0 ? a : null;
}

/** Un cambio del formato nuevo, validado. null = de un tipo o forma que esta versión no conoce.
 *  E3: `porChat` se lee en los 8 tipos y `retocada` y `mudadaPorElChat` en `tarea-nueva`: si no se
 *  leyeran, una fusión que reescribe `cambios` desde el borrador leído los borraría. */
function leerCambio(v: unknown): Cambio | null {
  if (!esObjeto(v) || typeof v.clave !== "string" || !v.clave) return null;
  const motivo = textoOpcional(v.motivo);
  const conMotivo = motivo ? { motivo: motivo.v } : {};
  const delChat = v.porChat === true ? { porChat: true as const } : {};
  switch (v.tipo) {
    case "ancla":
      if (v.clave !== "ancla" || typeof v.a !== "string" || !(v.desde === null || typeof v.desde === "string")) return null;
      return { tipo: "ancla", clave: "ancla", desde: dia(v.desde), a: v.a.slice(0, 10), ...delChat };
    case "orden": {
      const ids = (x: unknown) => (Array.isArray(x) && x.every((s) => typeof s === "string") ? (x as string[]) : null);
      const desde = ids(v.desde);
      const a = ids(v.a);
      if (v.clave !== "orden" || !desde || !a) return null;
      const motivos = ids(v.motivos);
      return { tipo: "orden", clave: "orden", desde, a, ...(motivos && motivos.length > 0 ? { motivos } : {}), ...delChat };
    }
    case "fase-nueva": {
      const fase = leerFaseNueva(v.fase);
      if (!fase || !(v.despuesDe === null || typeof v.despuesDe === "string")) return null;
      return { tipo: "fase-nueva", clave: v.clave, fase, despuesDe: v.despuesDe, ...conMotivo, ...delChat };
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
        ...conMotivo,
        ...delChat,
      };
    case "fase-se-va": {
      if (!esTextoEntre(v.faseId, 1, 200) || !esObjeto(v.desde)) return null;
      const foto = leerFotoDeFase(v.desde);
      const crudas = v.desde.tareas;
      if (!foto || !Array.isArray(crudas) || crudas.length > 2000) return null;
      const tareas: CambioFaseSeVa["desde"]["tareas"] = [];
      for (const t of crudas) {
        const fotoDeLaTarea = esObjeto(t) ? leerFotoDeTarea(t.foto) : null;
        if (!esObjeto(t) || !esTextoEntre(t.id, 1, 200) || !fotoDeLaTarea) return null;
        tareas.push({ id: t.id, foto: fotoDeLaTarea });
      }
      return { tipo: "fase-se-va", clave: v.clave, faseId: v.faseId, desde: { ...foto, tareas }, ...conMotivo, ...delChat };
    }
    case "tarea-nueva": {
      const tarea = leerContenidoDeTarea(v.tarea);
      if (typeof v.fase !== "string" || !v.fase || !tarea) return null;
      return {
        tipo: "tarea-nueva",
        clave: v.clave,
        fase: v.fase,
        tarea,
        ...conMotivo,
        ...delChat,
        ...(v.retocada === true ? { retocada: true as const } : {}),
        ...(v.mudadaPorElChat === true ? { mudadaPorElChat: true as const } : {}),
      };
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
        ...conMotivo,
        ...delChat,
      };
    }
    case "tarea-cambia": {
      const desde = leerFotoDeTarea(v.desde);
      const a = leerCambioDeTarea(v.a);
      if (typeof v.tareaId !== "string" || !v.tareaId || typeof v.faseId !== "string" || !v.faseId || !desde || !a) return null;
      if (!(v.conCambio === undefined || esTextoEntre(v.conCambio, 1, 300))) return null;
      return {
        tipo: "tarea-cambia",
        clave: v.clave,
        tareaId: v.tareaId,
        faseId: v.faseId,
        desde,
        a,
        ...(typeof v.conCambio === "string" ? { conCambio: v.conCambio } : {}),
        ...conMotivo,
        ...delChat,
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

/**
 * Campo por campo: un lector viejo ignora lo que no conoce, y lo que no viene no se inventa (E2c,
 * D3). `sesiones` (null o entero ≥ 0) y `semanaCero` (boolean) se leen SOLO si vienen; si vienen con
 * otra forma, la entrada entera no vale (sin su forma, las tareas de la fase chocan: la dirección
 * segura).
 */
function leerTareasArmadasPara(v: unknown): Borrador["tareasArmadasPara"] {
  const out: Borrador["tareasArmadasPara"] = {};
  if (!esObjeto(v)) return out;
  for (const [fase, x] of Object.entries(v)) {
    if (!esObjeto(x) || typeof x.nombre !== "string") continue;
    if (typeof x.semanas !== "number" || !Number.isInteger(x.semanas) || x.semanas < 1) continue;
    const conSesiones = x.sesiones !== undefined;
    if (conSesiones && !(x.sesiones === null || esSemana(x.sesiones))) continue;
    const conSemanaCero = x.semanaCero !== undefined;
    if (conSemanaCero && typeof x.semanaCero !== "boolean") continue;
    out[fase] = {
      nombre: x.nombre,
      semanas: x.semanas,
      ...(conSesiones ? { sesiones: x.sesiones as number | null } : {}),
      ...(conSemanaCero ? { semanaCero: x.semanaCero as boolean } : {}),
    };
  }
  return out;
}

const esTextoEntre = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max;

/**
 * El `recalculo` guardado (E2c), validado. Mal formado → ausente, y NO cuenta en `desconocidos`: es
 * metadata del servidor, no un cambio que se deje de aplicar.
 */
function leerRecalculo(v: unknown): RecalculoDelBorrador | null {
  if (!esObjeto(v) || !esTextoEntre(v.corrida, 1, 200)) return null;
  if (!Array.isArray(v.fases) || v.fases.length === 0 || v.fases.length > 200) return null;
  const fases: RecalculoDelBorrador["fases"] = [];
  for (const f of v.fases) {
    if (!esObjeto(f) || !esTextoEntre(f.id, 1, 200) || typeof f.nombre !== "string") return null;
    fases.push({ id: f.id, nombre: f.nombre });
  }
  if (!Array.isArray(v.sin) || v.sin.length > 2000 || !v.sin.every((s) => esTextoEntre(s, 1, 300))) return null;
  if (!(v.motivo === undefined || v.motivo === null || typeof v.motivo === "string")) return null;
  return {
    corrida: v.corrida,
    fases,
    sin: [...(v.sin as string[])],
    ...(v.motivo !== undefined ? { motivo: v.motivo as string | null } : {}),
  };
}

/** El `soloFase` guardado (E2b): un string de 1 a 200 caracteres; si no, no hay (todo el cronograma). */
const leerSoloFase = (v: unknown): string | null =>
  typeof v === "string" && v.length >= 1 && v.length <= 200 ? v : null;

/**
 * E3: las casillas guardadas: hasta 2000 claves de 1 a 300 caracteres. Mal formadas → ausentes, y NO
 * cuentan en `desconocidos` (no son un cambio que se deje de aplicar: aplicar lee el `sin` del cuerpo).
 */
function leerExcluidos(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 2000 || !v.every((s) => esTextoEntre(s, 1, 300))) return null;
  return [...(v as string[])];
}

/**
 * Lo guardado en `pendingProposal` como borrador, o null si no hay o no es `borrador-v1`. E4: ya no
 * convierte nada al leer (el formato viejo se convierte una vez, con scripts/propuestas-abiertas.ts):
 * quien recibe null y hay algo guardado lo trata como una propuesta que no sabe leer.
 */
export function leerBorrador(json: unknown): Borrador | null {
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
    const soloFase = leerSoloFase(json.soloFase);
    const recalculo = leerRecalculo(json.recalculo);
    const excluidos = leerExcluidos(json.excluidos);
    // E3 (D9): con la misma validación que la forma armada; lo que no vale, no entra.
    const ajustadas = esObjeto(json.ajustadasPorElChat) ? leerTareasArmadasPara(json.ajustadasPorElChat) : null;
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
      ...(soloFase ? { soloFase } : {}),
      ...(recalculo ? { recalculo } : {}),
      ...(excluidos ? { excluidos } : {}),
      ...(ajustadas ? { ajustadasPorElChat: ajustadas } : {}),
    };
  }
  return null;
}

// ── DE DÓNDE VIENE: una sola clasificación (E2b, D8) ─────────────────────────

/** De dónde salió la propuesta. La usan la barra, la auditoría de aplicar y los carteles. */
export type DeDondeViene =
  | { de: "handoff" }
  | { de: "generar" }
  | { de: "regenerar-todo" }
  | { de: "regenerar-fase"; fase: string | null }
  | { de: "reuniones" };

/**
 * De dónde viene lo guardado en `pendingProposal` (el JSON crudo o un `Borrador` ya leído). Puro.
 * Desde E4 lo guardado es siempre un v1; con otra cosa no tira (la clasifica igual), pero nadie la
 * muestra: la pantalla solo ofrece descartarla.
 *   · con `soloFase` → «Regenerar» de esa fase, con el nombre con que se armaron sus tareas (null
 *     mientras la IA todavía las arma);
 *   · uno que no es «contexto» (sin `origen`, o «handoff») → el handoff;
 *   · «contexto» con pedido «primera» → «Generar cronograma»; con «regenerar» → «Regenerar todo»;
 *   · el resto de «contexto» → el contexto del cronograma (las reuniones y notas elegidas).
 */
export function deDondeViene(json: unknown): DeDondeViene {
  if (!esObjeto(json)) return { de: "handoff" };
  const v1 = json.formato === FORMATO_BORRADOR;
  const soloFase = v1 ? leerSoloFase(json.soloFase) : null;
  if (soloFase) {
    const armada = esObjeto(json.tareasArmadasPara) ? json.tareasArmadasPara[soloFase] : undefined;
    const nombre = esObjeto(armada) && typeof armada.nombre === "string" && armada.nombre.trim() ? armada.nombre.trim() : null;
    return { de: "regenerar-fase", fase: nombre };
  }
  if (json.origen !== "contexto") return { de: "handoff" };
  if (v1 && json.pedido === "primera") return { de: "generar" };
  if (v1 && json.pedido === "regenerar") return { de: "regenerar-todo" };
  return { de: "reuniones" };
}

/** «desde …»: de dónde viene la propuesta, en palabras del CSE (la barra, los carteles). */
export function desdeDeLaPropuesta(d: DeDondeViene): string {
  switch (d.de) {
    case "handoff":
      return "desde el handoff";
    case "generar":
      return "desde «Generar cronograma»";
    case "regenerar-todo":
      return "desde «Regenerar todo»";
    case "regenerar-fase":
      return d.fase ? `desde «Regenerar» en «${d.fase}»` : "desde «Regenerar» de una fase";
    case "reuniones":
      return "desde el contexto del cronograma";
    default: {
      // Un origen nuevo sin su texto no compila.
      const _: never = d;
      return _;
    }
  }
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
  /** E2c: una tarea de una fase DESFASADA (`FaseDesfasada`): queda fuera hasta que se recalculen. */
  recalcula?: true;
  /** E3: solo en una `fase-se-va` que aplica: las tareas vivas que se quedan (con avance, cargadas a
   *  mano, creadas o editadas después), en el orden de lo vivo. Con alguna, la fase se queda. */
  rescate?: string[];
}

export type Lugar = { tipo: "existente"; id: string } | { tipo: "nueva"; clave: string };

/** Las tareas que se escriben al aplicar. Lo que suma E3 es opcional: los fixtures de E2a compilan. */
export interface EscriturasDeTareas {
  /** Los ids de las que se quitan, en el orden del cronograma vivo. */
  seVan: string[];
  /** Las que se crean, en el orden del borrador. */
  nuevas: Array<{ clave: string; fase: Lugar; tarea: ContenidoDeTareaNueva; porChat?: true; retocada?: true }>;
  /**
   * E3: las vivas que cambian, en el orden del cronograma vivo. `campos` lleva solo lo que difiere de
   * lo vivo (en una mudanza sin semana pedida, la semana viva: el escritor la acota al destino).
   * `aFase` = null si se queda en su fase.
   */
  cambian?: Array<{
    id: string;
    desdeFase: string;
    campos: { title?: string; weekIndex?: number; party?: Party | null; type?: TipoDeTarea | null };
    aFase: Lugar | null;
  }>;
}

export interface EscriturasDeEstructura {
  /** YYYY-MM-DD a escribir, o null = no se toca el arranque. */
  ancla: string | null;
  /** Solo los campos que cambian, por fase. */
  fases: Array<{ id: string; campos: Partial<Record<CampoDeFase, ValorDeCampo>> }>;
  nuevas: Array<{ clave: string; fase: FaseNuevaPropuesta; porChat?: true }>;
  /** El orden final: las existentes y las nuevas. El escritor toca solo las filas cuyo orden cambia.
   *  E3: una fase que se va entera (`queda: false`) ya no está. */
  orden: Lugar[];
  /** E3: las fases que se van. `borrar`: sus tareas pendientes que se van con ella; `queda`: se
   *  quedan tareas (el rescate), y la fase con ellas. */
  fasesQueSeVan?: Array<{ id: string; borrar: string[]; queda: boolean }>;
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
  /** Si no se puede aplicar entero, por qué (un borrador de una versión más nueva, las tareas
   *  todavía armándose o, E2c, fases desfasadas sin recalcular). null = se puede. */
  bloqueo: string | null;
  /** El que recibió el plan (lo deduce quien llama, de la corrida): null = no espera tareas. */
  estadoDeTareas: EstadoDeLasTareas | null;
  /** E2c: las fases cuyas tareas hay que recalcular (con alguna tarea que el CSE no desmarcó), en el
   *  orden de la lista. */
  desfasadas: FaseDesfasada[];
  /** E2c: las desfasadas que el CSE fuerza («Aplicar de todos modos»): sus tareas van tal cual. */
  forzadas: FaseDesfasada[];
  /** E2c: el bloqueo que manda es el de las desfasadas (no el de una versión nueva ni el de las tareas «armando»). */
  bloqueoPorDesfasadas: boolean;
}

const CHOQUE_CAMPO = "Lo cambiaste a mano después de la propuesta: queda como lo dejaste.";
const CHOQUE_SIN_TAREAS = "No se leyeron las tareas de esta fase: la tarea queda como está.";
const CHOQUE_TAREA_MUDADA = "La moviste a otra fase después de la propuesta: queda donde la dejaste.";
const CHOQUE_TAREA_CON_AVANCE = "La tarea ya tiene avance o la escribiste a mano: no se quita.";
/* Revisión de E2b: decía «La editaste a mano después de la propuesta». Con D10 el `desde` es lo que LEYÓ
   la IA, así que también choca la que se editó mientras armaba, cuando todavía no había propuesta. */
const CHOQUE_TAREA_EDITADA = "Se editó a mano después de que la IA la leyó: queda como está.";
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
// ── E3: la fase que se va y la tarea que cambia ──
const CHOQUE_SIN_TAREAS_DE_LA_FASE = "No se leyeron las tareas de esta fase: la fase queda como está.";
const CHOQUE_FASE_EDITADA = "La cambiaste a mano después de la propuesta: la fase se queda.";
const CHOQUE_FASE_EN_CURSO = "La fase ya arrancó: se queda.";
const CHOQUE_FASE_TODO_PROTEGIDO = "Todas sus tareas tienen avance o las escribiste a mano: la fase se queda.";
const CHOQUE_TAREA_AUSENTE = "Ya no está en el cronograma: este cambio queda fuera.";
const CHOQUE_DESTINO_FUERA = "Su fase de destino queda fuera.";
const choqueDestinoSeVa = (n: number) => `La fase de destino se quita con el cambio ${n}.`;
const choqueConCambio = (n: number) => `Va con el cambio ${n}, que queda fuera.`;
const choqueLaTareaSeQuita = (n: number) => `La tarea se quita con el cambio ${n}.`;
const choqueSuFaseSeQuita = (n: number) => `Su fase se quita con el cambio ${n}.`;
export const BLOQUEO_VERSION_NUEVA =
  "Esta propuesta tiene cambios que esta versión de Nexus no sabe aplicar: recarga la página.";
/** El 409 del PUT con motivo mientras hay una propuesta abierta (timeline/route.ts): lo muestran la
 *  pantalla y el chat tal cual, así que habla de la barra que el CSE tiene enfrente. Desde E2a la
 *  propuesta puede traer también tareas: se nombra «del cronograma», no «de cambios de fases». */
export const MENSAJE_PROPUESTA_ABIERTA =
  "Hay una propuesta del cronograma sin decidir (arriba del Gantt): aplícala o descártala antes de guardar este cambio.";
/** Revisión de E4 (#5c): el mismo 409 cuando lo guardado NO es un v1. No tiene barra ni «Aplicar»: solo se
 *  descarta en su línea, así que no se le dice «aplícala». */
export const MENSAJE_PROPUESTA_ILEGIBLE =
  "Hay una propuesta guardada que esta versión no sabe leer (arriba del Gantt): descártala antes de guardar este cambio.";
/** Qué dice el 409 del guardado con motivo, según lo que está guardado. La usan la ruta y la pantalla. */
export function mensajeDeLaPropuestaAbierta(guardada: unknown): string {
  return esBorradorV1(guardada) ? MENSAJE_PROPUESTA_ABIERTA : MENSAJE_PROPUESTA_ILEGIBLE;
}

/** El orden resultante con el cambio de orden aplicado sobre `ids`: primero las que nombra, después el resto.
 *  Exportado para el chat (operar-sobre-el-borrador.ts): el lugar de hoy de una fase que se va. */
export function ordenConCambio(ids: readonly string[], c: CambioDeOrden): string[] {
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
    case "fase-se-va": {
      /* E3 (D3): sin la fase, ya está. Sin sus tareas o su estado leídos no se sabe qué se llevaría:
         choca. Cualquier campo editado después, o la fase ya arrancada: se queda. El rescate de sus
         tareas va aparte (paso 4 del plan). */
      const f = vivo.fases.find((x) => x.id === c.faseId);
      if (!f) return { estado: "ya-esta" };
      if (f.tareas === undefined || f.status === undefined) return { estado: "choque", choque: CHOQUE_SIN_TAREAS_DE_LA_FASE };
      if (CAMPOS_POR_IMPACTO.some((campo) => valorDe(f, campo) !== c.desde[campo])) {
        return { estado: "choque", choque: CHOQUE_FASE_EDITADA };
      }
      if (f.status !== "PENDING") return { estado: "choque", choque: CHOQUE_FASE_EN_CURSO };
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

const valorDeTarea = (t: TareaDelVivo, campo: CampoDeTarea): string | number | null =>
  campo === "title" ? t.title : campo === "weekIndex" ? t.weekIndex : campo === "party" ? (t.party ?? null) : (t.type ?? null);

/** E3: la fase a la que se muda una tarea que cambia, o null si se queda en la suya. */
const destinoDeLaCambia = (c: CambioTareaCambia): string | null =>
  c.a.fase !== undefined && c.a.fase !== c.faseId ? c.a.fase : null;

/**
 * E3: la regla propia de una tarea viva que cambia (§2.3, paso 3b), sin el destino ni `conCambio` (los
 * mira el plan: dependen del estado de otros cambios). Campo por campo de `a`: vivo = `a` → hecho;
 * vivo = `desde` → pendiente; otro valor → la editaron a mano: choca. `isKept` NO frena: la
 * actualización conserva el estado. Mudada a mano justo a su destino, con todo hecho: ya está.
 */
function evaluarCambia(c: CambioTareaCambia, ind: IndiceDelVivo): Evaluacion {
  const fase = ind.fasePorId.get(c.faseId);
  if (fase ? fase.tareas === undefined : !ind.conTareas) return { estado: "choque", choque: CHOQUE_SIN_TAREAS };
  const viva = ind.tareaPorId.get(c.tareaId);
  if (!viva) return { estado: "choque", choque: CHOQUE_TAREA_AUSENTE };
  let pendientes = 0;
  let editada = false;
  for (const campo of CAMPOS_DE_TAREA) {
    const pedido = c.a[campo];
    if (pedido === undefined) continue;
    const hoy = valorDeTarea(viva.tarea, campo);
    if (hoy === pedido) continue;
    if (hoy === c.desde[campo]) pendientes++;
    else editada = true;
  }
  if (viva.faseId !== c.faseId) {
    return c.a.fase === viva.faseId && !editada && pendientes === 0
      ? { estado: "ya-esta" }
      : { estado: "choque", choque: CHOQUE_TAREA_MUDADA };
  }
  if (editada) return { estado: "choque", choque: CHOQUE_TAREA_EDITADA };
  if (pendientes === 0 && destinoDeLaCambia(c) === null) return { estado: "ya-esta" };
  return { estado: "pendiente" };
}

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

/** Cómo quedaría una fase para el cierre: nombre, semanas, sesiones y si es la primera (E2c, D3). */
interface FormaProyectada {
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  primera: boolean;
}

const sesionesDe = (v: ValorDeCampo): number | null => (v === null ? null : Number(v));

/**
 * La forma de cada fase (id o `n:…`) con los cambios de estructura que cumplen `incluye`. `primera`
 * es el primer lugar del mismo orden que ve `proyectar` (y por lo tanto la estructura supuesta).
 */
function formasProyectadas(
  vivo: Vivo,
  cambios: readonly Cambio[],
  estados: ReadonlyArray<{ estado: EstadoDelCambio } | undefined>,
  incluye: (e: EstadoDelCambio) => boolean,
  nuevasPorClave: ReadonlyMap<string, CambioFaseNueva>,
): Map<string, FormaProyectada> {
  const out = new Map<string, FormaProyectada>(
    vivo.fases.map((f) => [f.id, { name: f.name, durationWeeks: f.durationWeeks, sessionCount: f.sessionCount ?? null, primera: false }]),
  );
  const incluidos: Cambio[] = [];
  cambios.forEach((c, i) => {
    const e = estados[i];
    if (!e || !incluye(e.estado) || esCambioDeTarea(c)) return;
    incluidos.push(c);
    if (c.tipo === "fase-nueva") {
      out.set(c.clave, {
        name: c.fase.name,
        durationWeeks: c.fase.durationWeeks,
        sessionCount: c.fase.sessionCount ?? null,
        primera: false,
      });
    } else if (c.tipo === "fase-cambia") {
      const f = out.get(c.faseId);
      if (!f) return;
      if (c.campo === "name") f.name = String(c.a);
      else if (c.campo === "durationWeeks") f.durationWeeks = Number(c.a);
      else if (c.campo === "sessionCount") f.sessionCount = sesionesDe(c.a);
    }
  });
  const primero = ordenFinal(vivo, incluidos, nuevasPorClave)[0];
  if (primero) {
    const f = out.get(primero.tipo === "existente" ? primero.id : primero.clave);
    if (f) f.primera = true;
  }
  return out;
}

/** ¿La fase, como quedaría, es la forma para la que se armaron sus tareas? Lo que la armada no trae
 *  (sesiones, Semana 0: un borrador anterior a E2c) no se compara. */
const coincide = (x: FormaProyectada | undefined, armada: FormaDeFase): boolean =>
  !!x &&
  normalizarNombre(x.name) === normalizarNombre(armada.nombre) &&
  x.durationWeeks === armada.semanas &&
  (armada.sesiones === undefined || x.sessionCount === armada.sesiones) &&
  (armada.semanaCero === undefined || x.primera === armada.semanaCero);

const formaDe = (x: FormaProyectada): FormaDeFase => ({
  nombre: x.name,
  semanas: x.durationWeeks,
  sesiones: x.sessionCount,
  semanaCero: x.primera,
});

/** La fase de una tarea del borrador: el id de una existente o la clave `n:…` de una nueva. E3: la de
 *  una tarea que cambia es la de DESTINO (su grupo en la barra), y si no se muda, la suya. */
export const faseDeLaTarea = (c: CambioDeTarea): string =>
  c.tipo === "tarea-nueva" ? c.fase : c.tipo === "tarea-cambia" ? (c.a.fase ?? c.faseId) : c.faseId;
const llaveDeTarea = (titulo: string, semana: number) => `${huellaDeTitulo(titulo)}|${semana}`;

/**
 * El número de cada cambio en la barra: la estructura 1..k en su orden, y las tareas con el número de
 * su grupo (k + 1…, uno por fase en el orden en que aparece). Es la numeración de `resumir`: el plan
 * la usa para decir «el cambio N» en un choque.
 */
function numerosEnLaBarra(cambios: readonly Cambio[]): Map<string, number> {
  const out = new Map<string, number>();
  let k = 0;
  for (const c of cambios) if (!esCambioDeTarea(c)) out.set(c.clave, ++k);
  const grupos = new Map<string, number>();
  for (const c of cambios) {
    if (!esCambioDeTarea(c)) continue;
    const fase = faseDeLaTarea(c);
    if (!grupos.has(fase)) grupos.set(fase, k + grupos.size + 1);
    out.set(c.clave, grupos.get(fase)!);
  }
  return out;
}

/** El orden final: el cambio de orden (si se aplica) y las fases nuevas en su lugar. Es `buildPhaseOrder`.
 *  E3: las fases nuevas se insertan con `seVanEnteras` todavía en la lista (una puede ir detrás de
 *  ellas), y DESPUÉS se sacan esas. */
function ordenFinal(
  vivo: Vivo,
  aplicadas: readonly Cambio[],
  nuevasPorClave: ReadonlyMap<string, CambioFaseNueva>,
  seVanEnteras: ReadonlySet<string> = new Set(),
): Lugar[] {
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
  return seVanEnteras.size === 0 ? lugares : lugares.filter((l) => l.tipo === "nueva" || !seVanEnteras.has(l.id));
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
    case "tarea-cambia":
      return [c.tareaId, jsonCanonico(c.a), c.conCambio ?? null];
    case "fase-se-va":
      return c.faseId;
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
 * El orden de evaluación es determinista (E2a, §2.1; E3, §2.3):
 *   1. la ESTRUCTURA, como en E1 (E3: y la fase que se va);
 *   2. cómo quedaría cada fase —nombre y semanas— con lo marcado y con todo lo que se puede marcar;
 *   3. las tareas VIVAS: las que se van (su regla propia: avance, edición a mano, mudanza) y, E3, las
 *      que cambian (campo por campo, su destino y el cambio con el que van). Una tarea que cambia y
 *      se quita a la vez choca: gana la que se va;
 *   4. E3: el RESCATE de cada fase que se va: lo que tiene avance, se cargó a mano, se creó o se editó
 *      después se queda, y la fase con ello. Si se queda todo, la fase choca;
 *   5-6. las nuevas: una que ya está (misma huella de título y misma semana entre las que sobreviven
 *        en su fase, contando cuántas hay) no se escribe. Una del chat en una fase nueva sigue a esa
 *        fase (fuera, heredada; en choque, choca);
 *   7. el CIERRE de las tareas de la IA (lo del chat no se armó para ninguna forma): valen si la fase,
 *      como quedaría, conserva la forma con que se armaron (`tareasArmadasPara`: nombre, semanas y, si
 *      la armada los trae, sesiones y Semana 0) o la que le dio el chat (`ajustadasPorElChat`, D9).
 *      Si no: la fase nueva desmarcada se lleva sus tareas (heredadas); una fase cuya diferencia no
 *      la explican las casillas del CSE (una edición a mano) choca; y si la explican, la fase está
 *      DESFASADA (E2c): sus tareas quedan fuera marcadas `recalcula`, salvo que el CSE la fuerce;
 *   8. E3, defensivo: con una fase que se va, choca todo otro cambio marcado cuyo sujeto es ella
 *      (una tarea que SALE de ella no: se muda antes de que se vaya).
 * `tareas`: el estado de las tareas del borrador (lo deduce quien llama, de la corrida): mientras
 * se arman, no se aplica. `forzar` (E2c): las fases desfasadas cuyas tareas van tal cual
 * («Aplicar de todos modos»); sobre una fase que no está desfasada no hace nada.
 */
export function planDeAplicacion(
  vivo: Vivo,
  borrador: Borrador,
  sin: Iterable<string> = [],
  { tareas = null, forzar = [] }: { tareas?: EstadoDeLasTareas | null; forzar?: Iterable<string> } = {},
): PlanDeAplicacion {
  const fuera = new Set(sin);
  const forzadasPedidas = new Set(forzar);
  const nuevas = new Map(
    borrador.cambios.filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva").map((c) => [c.clave, c]),
  );
  const ind = indexar(vivo);
  const base = (c: Cambio): EstadoDelCambio => (fuera.has(c.clave) ? "excluido" : "aplica");
  type Estado = { estado: EstadoDelCambio; choque?: string; dependeDe?: string; recalcula?: true; rescate?: string[] };
  const desdeEvaluacion = (c: Cambio, ev: Evaluacion): Estado =>
    ev.estado === "choque"
      ? { estado: "choque", choque: ev.choque }
      : ev.estado === "ya-esta"
        ? { estado: "ya-esta" }
        : { estado: base(c) };
  const choca = (texto: string): Estado => ({ estado: "choque", choque: texto });
  const estados: Array<Estado | undefined> = new Array(borrador.cambios.length);
  // E3: «el cambio N» de un choque es el número de la barra; el estado de otro cambio, por su clave.
  const numeros = numerosEnLaBarra(borrador.cambios);
  const numeroDe = (clave: string): number => numeros.get(clave) ?? 0;
  const indicePorClave = new Map<string, number>();
  borrador.cambios.forEach((c, i) => {
    if (!indicePorClave.has(c.clave)) indicePorClave.set(c.clave, i);
  });
  const estadoDeLaClave = (clave: string): Estado | undefined => {
    const i = indicePorClave.get(clave);
    return i === undefined ? undefined : estados[i];
  };
  /** E3: las fases que se van con su cambio marcado: id de la fase → clave del cambio. */
  const fasesQueSeVanMarcadas = (): Map<string, string> => {
    const out = new Map<string, string>();
    borrador.cambios.forEach((c, i) => {
      if (c.tipo === "fase-se-va" && estados[i]?.estado === "aplica") out.set(c.faseId, c.clave);
    });
    return out;
  };

  // 1) La estructura: `evaluar` de E1 (E3: con la fase que se va).
  borrador.cambios.forEach((c, i) => {
    if (!esCambioDeTarea(c)) estados[i] = desdeEvaluacion(c, evaluar(c, vivo, nuevas));
  });

  // 2) Cómo quedaría cada fase, para el cierre (sin llamar a otro plan).
  const sePuedeMarcar = (e: EstadoDelCambio) => e === "aplica" || e === "excluido";
  const marcada = formasProyectadas(vivo, borrador.cambios, estados, (e) => e === "aplica", nuevas);
  const entera = formasProyectadas(vivo, borrador.cambios, estados, sePuedeMarcar, nuevas);
  // Algo que el CSE puede marcar mueve cuál fase va primera (la de la Semana 0).
  const mueveLaPrimera = borrador.cambios.some(
    (c, i) => (c.tipo === "fase-nueva" || c.tipo === "orden") && !!estados[i] && sePuedeMarcar(estados[i]!.estado),
  );

  // 3a) Las tareas que se van.
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-se-va") return;
    const ev = evaluarSeVa(c, ind);
    estados[i] = ev ? desdeEvaluacion(c, ev) : { estado: base(c) };
  });

  /* 3b) E3: las tareas vivas que cambian. Después de su regla propia, el DESTINO: una fase viva que se
     va con su cambio marcado, choca; una fase nueva desmarcada se la lleva (heredada), en choque la
     deja fuera; una que no está, choca. Y el cambio con el que va (D17): desmarcado, heredada; en
     choque, choca. */
  const seVanEnElPaso1 = fasesQueSeVanMarcadas();
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-cambia") return;
    const ev = evaluarCambia(c, ind);
    if (ev.estado !== "pendiente") {
      estados[i] = desdeEvaluacion(c, ev);
      return;
    }
    const destino = destinoDeLaCambia(c);
    if (destino !== null) {
      if (ind.fasePorId.has(destino)) {
        const seVa = seVanEnElPaso1.get(destino);
        if (seVa !== undefined) {
          estados[i] = choca(choqueDestinoSeVa(numeroDe(seVa)));
          return;
        }
      } else if (nuevas.has(destino)) {
        const e = estadoDeLaClave(destino);
        if (e?.estado === "excluido") {
          estados[i] = { estado: "excluido", dependeDe: destino };
          return;
        }
        if (e?.estado !== "aplica") {
          estados[i] = choca(CHOQUE_DESTINO_FUERA);
          return;
        }
      } else {
        estados[i] = choca(CHOQUE_FASE_BORRADA);
        return;
      }
    }
    if (c.conCambio !== undefined) {
      const e = estadoDeLaClave(c.conCambio);
      if (e?.estado === "excluido") {
        estados[i] = { estado: "excluido", dependeDe: c.conCambio };
        return;
      }
      if (e?.estado === "choque") {
        estados[i] = choca(choqueConCambio(numeroDe(c.conCambio)));
        return;
      }
    }
    estados[i] = { estado: base(c) };
  });

  // 3c) E3: dos cambios de la misma tarea (se va y cambia): gana el que la quita, y el otro choca.
  const seVaMarcadaDe = new Map<string, string>();
  borrador.cambios.forEach((c, i) => {
    if (c.tipo === "tarea-se-va" && estados[i]?.estado === "aplica") seVaMarcadaDe.set(c.tareaId, c.clave);
  });
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-cambia" || !estados[i] || !sePuedeMarcar(estados[i]!.estado)) return;
    const seVa = seVaMarcadaDe.get(c.tareaId);
    if (seVa !== undefined) estados[i] = choca(choqueLaTareaSeQuita(numeroDe(seVa)));
  });

  // Las que cambian marcadas, por tarea, y las que SALEN de cada fase (se mudan a otra).
  const cambiaMarcadaDe = new Map<string, CambioTareaCambia>();
  const salenDe = new Map<string, Set<string>>();
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-cambia" || estados[i]?.estado !== "aplica") return;
    cambiaMarcadaDe.set(c.tareaId, c);
    if (destinoDeLaCambia(c) !== null) salenDe.set(c.faseId, (salenDe.get(c.faseId) ?? new Set<string>()).add(c.tareaId));
  });

  /* 4) E3 (D3): el RESCATE de cada fase que se va. Se queda lo que tiene avance o se cargó a mano
     (`isKept`), lo creado después (no está en la foto) y lo editado después (su foto cambió); lo que
     sale con una mudanza marcada no cuenta. Una que el chat iba a mudar a otra fase y cuya mudanza
     quedó fuera (su destino desmarcado, por ejemplo) también se queda: se pidió conservarla, no
     quitarla. Si entre lo que no sale se queda TODO, quitarla no haría nada: choca. Se calcula con el
     estado FINAL de las mudanzas, y nada de lo que viene después toca una que sale: esto es final. */
  const mudanzaQueNoSale = new Set<string>();
  borrador.cambios.forEach((c, i) => {
    if (c.tipo === "tarea-cambia" && destinoDeLaCambia(c) !== null && estados[i]?.estado !== "aplica") {
      mudanzaQueNoSale.add(c.tareaId);
    }
  });
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "fase-se-va" || estados[i]?.estado !== "aplica") return;
    const salen = salenDe.get(c.faseId);
    const fotos = new Map(c.desde.tareas.map((t) => [t.id, t.foto]));
    const quedan = (ind.fasePorId.get(c.faseId)?.tareas ?? []).filter((t) => !salen?.has(t.id));
    const rescate = quedan.filter((t) => {
      const foto = fotos.get(t.id);
      return isKept(t) || !foto || !mismaFoto(fotoDeTarea(t), foto) || mudanzaQueNoSale.has(t.id);
    });
    if (quedan.length > 0 && rescate.length === quedan.length) {
      estados[i] = choca(CHOQUE_FASE_TODO_PROTEGIDO);
      return;
    }
    estados[i] = { estado: "aplica", rescate: rescate.map((t) => t.id) };
  });
  const fasesQueSeVan = fasesQueSeVanMarcadas();
  /** Las tareas que se borran con su fase: las vivas menos el rescate y menos las que salen. */
  const seBorranConSuFase = new Set<string>();
  borrador.cambios.forEach((c, i) => {
    const e = estados[i];
    if (c.tipo !== "fase-se-va" || e?.estado !== "aplica") return;
    const quedan = new Set(e.rescate ?? []);
    const salen = salenDe.get(c.faseId);
    for (const t of ind.fasePorId.get(c.faseId)?.tareas ?? []) {
      if (!quedan.has(t.id) && !salen?.has(t.id)) seBorranConSuFase.add(t.id);
    }
  });

  // 5) Las que sobreviven en cada fase: las vivas menos las que se van marcadas. Se cuentan por
  //    huella del título + semana (dos iguales en la misma semana son dos), con la semana ACOTADA a
  //    la duración final de su fase: al acortarla, el servidor las mueve a la última semana y ahí es
  //    donde una nueva igual sería un duplicado (revisión de E2a).
  //    E3: tampoco cuentan las que salen con una mudanza ni las que se borran con su fase; las que
  //    llegan con una mudanza sí, y una que cambia cuenta con su título y su semana nuevos.
  const semanaFinal = (fase: string, semana: number): number => {
    const dur = marcada.get(fase)?.durationWeeks;
    return dur === undefined ? semana : acotarSemana(semana, dur);
  };
  const lleganA = new Map<string, Array<{ title: string; semana: number }>>();
  for (const c of cambiaMarcadaDe.values()) {
    const destino = destinoDeLaCambia(c);
    const viva = ind.tareaPorId.get(c.tareaId)?.tarea;
    if (destino === null || !viva) continue;
    lleganA.set(destino, [...(lleganA.get(destino) ?? []), { title: c.a.title ?? viva.title, semana: c.a.weekIndex ?? viva.weekIndex }]);
  }
  const cuentas = new Map<string, Map<string, number>>();
  const cuentaDe = (fase: string): Map<string, number> => {
    const hecha = cuentas.get(fase);
    if (hecha) return hecha;
    const cuenta = new Map<string, number>();
    const sumar = (titulo: string, semana: number) => {
      const k = llaveDeTarea(titulo, semanaFinal(fase, semana));
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    };
    for (const t of ind.fasePorId.get(fase)?.tareas ?? []) {
      if (seVaMarcadaDe.has(t.id) || seBorranConSuFase.has(t.id)) continue;
      const cambia = cambiaMarcadaDe.get(t.id);
      if (cambia && destinoDeLaCambia(cambia) !== null) continue; // sale de la fase
      sumar(cambia?.a.title ?? t.title, cambia?.a.weekIndex ?? t.weekIndex);
    }
    for (const l of lleganA.get(fase) ?? []) sumar(l.title, l.semana);
    cuentas.set(fase, cuenta);
    return cuenta;
  };

  // 6) Las nuevas, en el orden del borrador: cada una que encuentra una igual la consume.
  borrador.cambios.forEach((c, i) => {
    if (c.tipo !== "tarea-nueva") return;
    if (!ind.fasePorId.has(c.fase) && !nuevas.has(c.fase)) {
      estados[i] = { estado: "choque", choque: CHOQUE_FASE_BORRADA };
      return;
    }
    /* E3: una del chat en una fase nueva no pasa por el cierre (no se armó para ninguna forma): sigue
       a su fase. Desmarcada la fase, queda fuera con ella (heredada); en choque, choca. Lo mismo una de
       la IA que el chat mudó ahí (`mudadaPorElChat`, revisión de E3). */
    if ((c.porChat || c.mudadaPorElChat) && nuevas.has(c.fase)) {
      const e = estadoDeLaClave(c.fase);
      if (e?.estado === "excluido") {
        estados[i] = { estado: "excluido", dependeDe: c.fase };
        return;
      }
      if (e?.estado !== "aplica") {
        estados[i] = choca(CHOQUE_DE_LA_FASE);
        return;
      }
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

  // 7) El cierre, por fase: solo toca tareas de la IA que se podrían aplicar.
  const padreExcluido = (fase: string): string | undefined => {
    const j = borrador.cambios.findIndex(
      (c, i) =>
        estados[i]?.estado === "excluido" &&
        ((c.tipo === "fase-nueva" && c.clave === fase) ||
          (c.tipo === "fase-cambia" && c.faseId === fase && (c.campo === "name" || c.campo === "durationWeeks"))),
    );
    return j >= 0 ? borrador.cambios[j].clave : undefined;
  };
  /* ¿Las casillas del CSE explican cada diferencia entre la fase como quedaría y la forma armada? El
     valor armado tiene que ser el de lo vivo (o el de la fase nueva) o el `a` de un cambio de ese campo
     que se puede marcar; y la Semana 0 solo la mueve un cambio de orden o una fase nueva que se puede
     marcar. Una edición a mano hace chocar el cambio de su campo y no deja otro valor posible. */
  const alcanzable = (fase: string, m: FormaProyectada, armada: FormaDeFase): boolean => {
    const viva = ind.fasePorId.get(fase);
    const nueva = nuevas.get(fase);
    const origen = viva
      ? { name: viva.name, durationWeeks: viva.durationWeeks, sessionCount: viva.sessionCount ?? null }
      : nueva
        ? { name: nueva.fase.name, durationWeeks: nueva.fase.durationWeeks, sessionCount: nueva.fase.sessionCount ?? null }
        : null;
    if (!origen) return false;
    const valores = (campo: CampoDeFase): ValorDeCampo[] =>
      borrador.cambios.flatMap((c, i) =>
        c.tipo === "fase-cambia" && c.faseId === fase && c.campo === campo && !!estados[i] && sePuedeMarcar(estados[i]!.estado)
          ? [c.a]
          : [],
      );
    if (normalizarNombre(m.name) !== normalizarNombre(armada.nombre)) {
      const posibles = [origen.name, ...valores("name").map((v) => String(v))].map(normalizarNombre);
      if (!posibles.includes(normalizarNombre(armada.nombre))) return false;
    }
    if (m.durationWeeks !== armada.semanas) {
      const posibles = [origen.durationWeeks, ...valores("durationWeeks").map((v) => Number(v))];
      if (!posibles.includes(armada.semanas)) return false;
    }
    if (armada.sesiones !== undefined && m.sessionCount !== armada.sesiones) {
      const posibles = [origen.sessionCount, ...valores("sessionCount").map(sesionesDe)];
      if (!posibles.includes(armada.sesiones)) return false;
    }
    if (armada.semanaCero !== undefined && m.primera !== armada.semanaCero && !mueveLaPrimera) return false;
    return true;
  };
  const forzadasEnElPlan = new Set<string>();
  borrador.cambios.forEach((c, i) => {
    /* E3 (D4): lo del chat y las que cambian no entran al cierre: solo dependen de que exista su fase.
       Tampoco una de la IA que el chat mudó de fase (revisión de E3): ya no es de la forma armada. */
    if ((c.tipo !== "tarea-nueva" && c.tipo !== "tarea-se-va") || c.porChat) return;
    if (c.tipo === "tarea-nueva" && c.mudadaPorElChat) return;
    const e = estados[i];
    if (!e || (e.estado !== "aplica" && e.estado !== "excluido")) return;
    const fase = faseDeLaTarea(c);
    const armada = borrador.tareasArmadasPara[fase];
    // 7.1) Sin la forma armada no se sabe para qué estructura son.
    if (!armada) {
      estados[i] = { estado: "choque", choque: CHOQUE_DE_LA_FASE };
      return;
    }
    /* 7.2) La fase como quedaría es la armada, o (E3, D9) la que le dio el chat: nada que cerrar. La
       ajustada vive aparte, así desmarcar el cambio del chat vuelve a la armada sin recalcular. */
    const ajustada = borrador.ajustadasPorElChat?.[fase];
    const coincideAlguna = (x: FormaProyectada | undefined) => coincide(x, armada) || (!!ajustada && coincide(x, ajustada));
    const m = marcada.get(fase);
    if (coincideAlguna(m)) return;
    // 7.3) Una fase nueva desmarcada: sus tareas se van con ella (heredadas), como antes de E2c.
    if (!m) {
      const padre = coincideAlguna(entera.get(fase)) ? padreExcluido(fase) : undefined;
      estados[i] = padre ? { estado: "excluido", dependeDe: padre } : { estado: "choque", choque: CHOQUE_DE_LA_FASE };
      return;
    }
    // 7.4) Lo que no explican las casillas del CSE es una edición a mano: choca.
    if (!alcanzable(fase, m, armada)) {
      estados[i] = { estado: "choque", choque: CHOQUE_DE_LA_FASE };
      return;
    }
    // 7.5) «Aplicar de todos modos»: sus tareas quedan como las marcó el CSE, tal cual.
    if (forzadasPedidas.has(fase)) {
      forzadasEnElPlan.add(fase);
      return;
    }
    /* 7.6) DESFASADA (E2c P3, el interruptor): queda fuera marcada `recalcula`, SIN `dependeDe`. Ya no
       «va con» el cambio que el CSE desmarcó: sus tareas se recalculan para la forma que queda, y
       mientras tanto la casilla sigue en manos del CSE (`seMarca`) y aplicar espera (el bloqueo de
       abajo). Hasta P1 quedaba heredada de ese cambio, con su «Va con el cambio N». */
    estados[i] = { estado: "excluido", recalcula: true };
  });

  /* 8) E3, defensivo: con una fase que se va, choca todo otro cambio marcado cuyo sujeto es ella —un
     cambio de un campo suyo, una tarea nueva, una que se va o una que cambia sin salir—. Lo que espera
     un recálculo cuenta como marcado (D6): si no, una fase que se va quedaría «desfasada» y frenaría
     el aplicar. Una tarea que SALE de ella no es su sujeto: se muda antes de que se borre. */
  if (fasesQueSeVan.size > 0) {
    borrador.cambios.forEach((c, i) => {
      const e = estados[i];
      if (!e || !(e.estado === "aplica" || (e.recalcula && !fuera.has(c.clave)))) return;
      const sujeto =
        c.tipo === "fase-cambia" || c.tipo === "tarea-se-va"
          ? c.faseId
          : c.tipo === "tarea-nueva"
            ? c.fase
            : c.tipo === "tarea-cambia" && destinoDeLaCambia(c) === null
              ? c.faseId
              : null;
      const seVa = sujeto === null ? undefined : fasesQueSeVan.get(sujeto);
      if (seVa !== undefined) estados[i] = choca(choqueSuFaseSeQuita(numeroDe(seVa)));
    });
  }

  const items: ItemDelPlan[] = borrador.cambios.map((cambio, i) => {
    const e = estados[i]!;
    return {
      numero: i + 1,
      cambio,
      estado: e.estado,
      ...(e.choque !== undefined ? { choque: e.choque } : {}),
      ...(e.dependeDe !== undefined ? { dependeDe: e.dependeDe } : {}),
      ...(e.recalcula ? { recalcula: true as const } : {}),
      ...(e.rescate !== undefined ? { rescate: e.rescate } : {}),
    };
  });

  /* Las fases desfasadas y las forzadas, en el orden de la lista. Una desfasada tiene alguna tarea
     `recalcula` que el CSE no desmarcó: con todas sus tareas desmarcadas no hay nada que recalcular. */
  const enEspera = new Set<string>();
  const fasesEnOrden: string[] = [];
  for (const it of items) {
    if (!esCambioDeTarea(it.cambio)) continue;
    const fase = faseDeLaTarea(it.cambio);
    if (!fasesEnOrden.includes(fase)) fasesEnOrden.push(fase);
    if (it.recalcula && !fuera.has(it.cambio.clave)) enEspera.add(fase);
  }
  // Solo llegan acá fases que quedan (7.3 saca las que no): el `flatMap` no tira dentro de la transacción.
  const conSuForma = (en: ReadonlySet<string>): FaseDesfasada[] =>
    fasesEnOrden.flatMap((fase) => {
      const m = marcada.get(fase);
      const armada = borrador.tareasArmadasPara[fase];
      return en.has(fase) && m && armada ? [{ fase, nombre: m.name, forma: formaDe(m), armada }] : [];
    });
  const desfasadas = conSuForma(enEspera);
  const forzadas = conSuForma(forzadasEnElPlan);
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
  const lugarDe = (fase: string): Lugar =>
    ind.fasePorId.has(fase) ? { tipo: "existente", id: fase } : { tipo: "nueva", clave: fase };
  // E3: las que cambian y las fases que se van, de lo aplicado (en el orden del cronograma vivo).
  const cambiaAplicada = new Map(
    aplicadas.flatMap((c) => (c.tipo === "tarea-cambia" ? [[c.tareaId, c] as const] : [])),
  );
  const rescateDe = new Map(
    items.flatMap((it) =>
      it.estado === "aplica" && it.cambio.tipo === "fase-se-va" ? [[it.cambio.faseId, it.rescate ?? []] as const] : [],
    ),
  );
  const fasesQueSeVanEscritas = vivo.fases.flatMap((f) => {
    const rescate = rescateDe.get(f.id);
    if (rescate === undefined) return [];
    const quedan = new Set(rescate);
    const borrar = (f.tareas ?? [])
      .filter((t) => {
        const cambia = cambiaAplicada.get(t.id);
        return !quedan.has(t.id) && !(cambia && destinoDeLaCambia(cambia) !== null);
      })
      .map((t) => t.id);
    return [{ id: f.id, borrar, queda: quedan.size > 0 }];
  });
  const seVanEnteras = new Set(fasesQueSeVanEscritas.filter((f) => !f.queda).map((f) => f.id));
  type Cambian = NonNullable<EscriturasDeTareas["cambian"]>;
  const cambian: Cambian = vivo.fases.flatMap((f) =>
    (f.tareas ?? []).flatMap((t): Cambian => {
      const c = cambiaAplicada.get(t.id);
      if (!c) return [];
      const campos: Cambian[number]["campos"] = {};
      if (c.a.title !== undefined && c.a.title !== t.title) campos.title = c.a.title;
      if (c.a.weekIndex !== undefined && c.a.weekIndex !== t.weekIndex) campos.weekIndex = c.a.weekIndex;
      if (c.a.party !== undefined && c.a.party !== (t.party ?? null)) campos.party = c.a.party;
      if (c.a.type !== undefined && c.a.type !== (t.type ?? null)) campos.type = c.a.type;
      const destino = destinoDeLaCambia(c);
      // Una mudanza lleva siempre su semana: la pedida o la viva (el escritor la acota al destino).
      if (destino !== null && campos.weekIndex === undefined) campos.weekIndex = t.weekIndex;
      return [{ id: t.id, desdeFase: c.faseId, campos, aFase: destino === null ? null : lugarDe(destino) }];
    }),
  );
  const escrituras: EscriturasDeEstructura & { tareas: EscriturasDeTareas } = {
    ancla: ancla ? ancla.a : null,
    // En el orden del cronograma vivo: el mismo orden de escritura en la pantalla y en el servidor.
    fases: vivo.fases.filter((f) => porFase.has(f.id)).map((f) => ({ id: f.id, campos: porFase.get(f.id)! })),
    nuevas: aplicadas
      .filter((c): c is CambioFaseNueva => c.tipo === "fase-nueva")
      .map((c) => ({ clave: c.clave, fase: c.fase, ...(c.porChat ? { porChat: true as const } : {}) })),
    orden: ordenFinal(vivo, aplicadas, nuevas, seVanEnteras),
    fasesQueSeVan: fasesQueSeVanEscritas,
    tareas: {
      seVan: vivo.fases.flatMap((f) => (f.tareas ?? []).filter((t) => seVanAplicadas.has(t.id)).map((t) => t.id)),
      nuevas: aplicadas
        .filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva")
        .map((c) => ({
          clave: c.clave,
          fase: lugarDe(c.fase),
          tarea: c.tarea,
          ...(c.porChat ? { porChat: true as const } : {}),
          ...(c.retocada ? { retocada: true as const } : {}),
        })),
      cambian,
    },
  };

  /* La huella: número, clave, estado y destino de cada cambio. E3: el rescate de una fase que se va
     entra SOLO si existe, así las huellas de todo lo anterior no cambian (una pestaña abierta durante
     el deploy sigue aplicando). */
  const huella = huellaDeTexto(
    JSON.stringify(
      items.map((it) => [it.numero, it.cambio.clave, it.estado, destinoDe(it.cambio), ...(it.rescate ? [it.rescate] : [])]),
    ),
  );
  /* El bloqueo, en este orden: una versión nueva, las tareas «armando» y (E2c P3) las fases
     desfasadas sin forzar. Aplicar espera a que se recalculen; la salida está siempre a mano:
     desmarcar sus tareas, o «Aplicar de todos modos» si el recálculo falló. `bloqueoPorDesfasadas`
     dice que el bloqueo que manda es ese (la barra lo dice en la línea del recálculo, no dos veces). */
  const bloqueoPrevio =
    borrador.desconocidos && borrador.desconocidos > 0
      ? BLOQUEO_VERSION_NUEVA
      : tareas === "armando"
        ? BLOQUEO_TAREAS_EN_CURSO
        : null;
  const porDesfasadas = bloqueoPrevio === null && desfasadas.length > 0;
  return {
    items,
    aplicadas,
    marcadas: aplicadas.length,
    aplicables: items.filter((it) => it.estado === "aplica" || it.estado === "excluido").length,
    total: items.filter((it) => it.estado !== "ya-esta").length,
    choques: items.filter((it) => it.estado === "choque").length,
    huella,
    escrituras,
    bloqueo: porDesfasadas ? bloqueoPorDesfasadas(desfasadas.map((d) => d.nombre)) : bloqueoPrevio,
    estadoDeTareas: tareas,
    desfasadas,
    forzadas,
    bloqueoPorDesfasadas: porDesfasadas,
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
 * de la revisión le cambiaba la lista al CSE, le hacía perder lo desmarcado, y su «Aplicar» terminaba
 * en un 409.
 * Una que ya no tiene nada que decidir (todo ya está así) no frena: reemplazarla no pierde nada, y
 * la pantalla igual la descartaría sola. El plan se calcula contra LO VIVO: para saber si queda algo
 * por decidir alcanza con lo de hoy.
 * ⚠ Un v1 que ESPERA tareas (`tareas` sin `listas`) está por decidir sin leer la corrida: si el
 * handoff lo pisara a mitad del paso 2, la corrida pagada se perdería.
 * ⛔ FALLA CERRADA (E4): algo guardado que no es un v1 (esta versión no lo sabe leer) cuenta como por
 * decidir. El handoff no pisa lo que no entiende: la pantalla ofrece descartarlo, y lo decide el CSE.
 */
export function propuestaPorDecidir(guardado: unknown, vivo: Vivo): boolean {
  const borrador = leerBorrador(guardado);
  if (!borrador) return guardado != null;
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
  /** E3: una viva que cambia (renombre, semana, dueño, tipo o mudanza): ya con lo que cambia. */
  cambia?: true;
  /** E3: llega con una mudanza desde otra fase. */
  llega?: true;
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

/** La proyección de un plan ya calculado (E3: quien edita la propuesta mira el plan y la vista a la vez,
 *  sin evaluarlo dos veces). */
export function proyectarConPlan(vivo: Vivo, plan: PlanDeAplicacion): Proyeccion {
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

  /* Las tareas: las vivas que sobreviven (en su orden), después las que llegan con una mudanza (E3) y
     al final las nuevas marcadas (en el orden del borrador), todas acotadas a la duración final de su
     fase. Una viva que cambia se ve ya con lo que cambia. */
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
  // E3: lo que se borra con su fase, lo que cambia y lo que llega a cada fase.
  const conSuFase = new Set((plan.escrituras.fasesQueSeVan ?? []).flatMap((f) => f.borrar));
  const quedanEn = new Map((plan.escrituras.fasesQueSeVan ?? []).filter((f) => f.queda).map((f) => [f.id, f]));
  const cambian = new Map((plan.escrituras.tareas.cambian ?? []).map((c) => [c.id, c]));
  const claveDelLugar = (l: Lugar) => (l.tipo === "existente" ? l.id : l.clave);
  const lleganA = new Map<string, TareaDelVivo[]>();
  const tocadasEn = new Map<string, Set<string>>();
  const tocar = (fase: string, tarea: string) => tocadasEn.set(fase, (tocadasEn.get(fase) ?? new Set<string>()).add(tarea));
  for (const f of vivo.fases) {
    for (const t of f.tareas ?? []) {
      const c = cambian.get(t.id);
      if (!c) continue;
      tocar(c.desdeFase, t.id);
      if (c.aFase === null) continue;
      const destino = claveDelLugar(c.aFase);
      tocar(destino, t.id);
      lleganA.set(destino, [...(lleganA.get(destino) ?? []), t]);
    }
  }
  const proyectada = (t: TareaDelVivo, duracion: number, llega: boolean): TareaProyectada => {
    const c = cambian.get(t.id);
    const campos = c?.campos ?? {};
    return {
      id: t.id,
      clave: t.id,
      title: campos.title ?? t.title,
      weekIndex: acotarSemana(campos.weekIndex ?? t.weekIndex, duracion),
      notes: t.notes ?? null,
      party: campos.party !== undefined ? campos.party : (t.party ?? null),
      type: campos.type !== undefined ? campos.type : (t.type ?? null),
      status: t.status,
      source: t.source,
      needsValidation: c ? false : (t.needsValidation ?? false),
      ...(c ? { cambia: true as const } : {}),
      ...(llega ? { llega: true as const } : {}),
    };
  };
  for (const f of fases) {
    const vivas = f.id !== null ? (porId.get(f.id)?.tareas ?? []) : [];
    const agregadas = nuevasPorFase.get(f.clave) ?? [];
    f.tareas = [
      ...vivas
        .filter((t) => !seVan.has(t.id) && !conSuFase.has(t.id) && !cambian.get(t.id)?.aFase)
        .map((t) => proyectada(t, f.durationWeeks, false)),
      ...(lleganA.get(f.clave) ?? []).map((t) => proyectada(t, f.durationWeeks, true)),
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
    if (f.id === null && f.marca) {
      const cambiaron = tocadasEn.get(f.clave)?.size ?? 0;
      const extra = [
        ...(agregadas.length > 0 ? [etiquetaDeTareas("+", agregadas.length)] : []),
        ...(cambiaron > 0 ? [plural(cambiaron, "tarea cambia", "tareas cambian")] : []),
      ];
      if (extra.length > 0) f.marca = { ...f.marca, etiquetas: [...f.marca.etiquetas, ...extra] };
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
    // E3: las que cambian (o se mudan desde o hacia acá), y la fase que se iba y se queda con lo suyo.
    const cambiaron = tocadasEn.get(f.id)?.size ?? 0;
    if (cambiaron > 0) etiquetas.push(plural(cambiaron, "tarea cambia", "tareas cambian"));
    const queda = quedanEn.get(f.id);
    if (queda) {
      const n = (actual.tareas ?? []).filter((t) => !queda.borrar.includes(t.id) && !cambian.get(t.id)?.aFase).length;
      etiquetas.push(`se queda con ${plural(n, "tarea", "tareas")}`);
    }
    if (etiquetas.length > 0) f.marca = { tono: "cambia", etiquetas };
  });

  /* Revisión de E2c: una fase desfasada (sin forzar) se ve SIN las tareas que esperan su recálculo (no
     se aplican todavía). La marca lo dice: si no, parecía que el CSE las había quitado. */
  const porRecalcular = new Set(plan.desfasadas.map((d) => d.fase));
  for (const f of fases) {
    if (!porRecalcular.has(f.clave)) continue;
    f.marca = { tono: f.marca?.tono ?? "cambia", etiquetas: [...(f.marca?.etiquetas ?? []), ETIQUETA_POR_RECALCULAR] };
  }

  return { ancla: plan.escrituras.ancla ?? dia(vivo.ancla), fases };
}

/** La marca de una fase desfasada en «Ver la propuesta»: sus tareas esperan el recálculo. */
export const ETIQUETA_POR_RECALCULAR = "tareas por recalcular";

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
 * proyectado con todo lo que no choca y, por defecto, sin mirar lo que desmarcó el CSE (eso vive en
 * su pantalla). Lo que el CSE desmarque después lo resuelve el cierre del plan con `tareasArmadasPara`.
 * E2c: el recálculo de las fases desfasadas pasa `sin` (las claves de estructura desmarcadas al
 * pedirlo): es la estructura con lo marcado, la que va a quedar.
 */
export function estructuraHipotetica(vivo: Vivo, borrador: Borrador, sin: Iterable<string> = []): EstructuraHipotetica {
  const soloEstructura: Borrador = { ...borrador, cambios: borrador.cambios.filter((c) => !esCambioDeTarea(c)) };
  const p = proyectar(vivo, soloEstructura, sin);
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

/**
 * La forma de una fase en una estructura supuesta (E2c), o null si no está. La Semana 0 es la PRIMERA
 * del orden: lo mismo que elige `elegirFaseDeSemanaCero` sobre esa estructura (ahí el orden es la
 * posición).
 */
export function formaEnLaEstructura(e: EstructuraHipotetica, id: string): FormaDeFase | null {
  const f = e.fases.find((x) => x.id === id);
  if (!f) return null;
  return { nombre: f.name, semanas: f.durationWeeks, sesiones: f.sessionCount ?? null, semanaCero: e.fases[0]?.id === id };
}

/** ¿Dos formas de fase son la misma? Los cuatro campos (el nombre sin mayúsculas ni espacios de más). */
export function mismaForma(a: FormaDeFase | null, b: FormaDeFase | null): boolean {
  if (!a || !b) return false;
  return (
    normalizarNombre(a.nombre) === normalizarNombre(b.nombre) &&
    a.semanas === b.semanas &&
    (a.sesiones ?? null) === (b.sesiones ?? null) &&
    (a.semanaCero ?? false) === (b.semanaCero ?? false)
  );
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
  /** E3: una fase que se va y se queda con tareas: «Se queda con N tareas con avance, …». */
  nota?: string;
}

/** Una tarea de la lista de la barra (un renglón dentro de su grupo). */
export interface ItemDeTarea {
  clave: string;
  /** E3: cómo la nombra el chat: la clave `t:` de una nueva, el id de una viva en las demás. */
  ref: string;
  estado: EstadoDelCambio;
  /** «+» se crea, «−» se quita, «~» cambia en su fase, «→» se muda a esta fase (E3). */
  signo: "+" | "−" | "~" | "→";
  titulo: string;
  /** E3: qué le cambia («viene de «Diseño»», «pasa a S3», «renombrada a «Y»», «la hace el cliente»). */
  cambio?: string;
  /** La semana dentro de su fase, contando desde 1 (S1 = la primera de la fase). */
  semana: number;
  /** El ⚠ del choque, o que ya está (o ya no está). */
  aviso?: string;
  /** La casilla se puede tocar: aplica o la desmarcó el CSE. Una que quedó fuera con su fase nueva
   *  desmarcada (heredada) no: vuelve cuando se marca esa fase. Una en espera de recalcularse (E2c)
   *  sí: el CSE puede desmarcarla para aplicar sin ella. */
  seMarca: boolean;
  /** Por qué está «por validar» (el tooltip), si lo está. */
  porValidar?: string;
  /** El título o la nota cruzan la frontera del material interno. */
  fuga?: { campo: "titulo" | "nota"; motivo: string; motivoDeLaNota?: string };
  /** Ya existe una igual en OTRA fase (la más avanzada, si hay varias). */
  repetida?: AvisoRepetida;
  /** E2c: su fase está desfasada y el CSE no la desmarcó: solo para pintar la casilla marcada
   *  mientras se recalcula (su estado es «excluido»). */
  enEspera?: boolean;
}

/** Las tareas de UNA fase, en un solo renglón de la lista (con su casilla de grupo). */
export interface GrupoDeTareas {
  /** Sigue a los cambios de estructura: k + i + 1. */
  numero: number;
  /** La fase: el id de una existente o la clave `n:…` de una nueva. */
  fase: string;
  /** Su nombre en la propuesta. */
  nombre: string;
  /** Las que se crean, las que se quitan y (E3) las que cambian o llegan (sin contar las que ya están así). */
  nuevas: number;
  seVan: number;
  cambian: number;
  marcadas: number;
  aplicables: number;
  estado: "aplica" | "parcial" | "excluido" | "choque" | "ya-esta";
  /** El número (en la lista) del cambio de fase con el que quedaron fuera sus tareas, o null. */
  dependeDe: number | null;
  /** E2c: la fase está desfasada: sus tareas hay que recalcularlas. */
  desfasada: boolean;
  aviso?: string;
  tareas: ItemDeTarea[];
}

/** Las tareas que se escriben con lo marcado (la confirmación las cuenta). */
export interface TareasDelResumen {
  nuevas: number;
  seVan: number;
  /** E3: las vivas que cambian (se muden o no). */
  cambian: number;
  /** E3: las fases que se van: su nombre, cuántas tareas pendientes se van con ella y si se queda. */
  fasesSeVan: Array<{ nombre: string; borradas: number; queda: boolean }>;
  /** E3: las tareas que se borran con su fase (todas las fases que se van). */
  conLaFase: number;
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
  tareas: TareasDelResumen;
  /** Hay alguna tarea que se va marcada, o (E3) una fase que se va: aplicar BORRA (se confirma). */
  borraAlgo: boolean;
  /** E3: lo que se borra lo dictó el chat, o es una fase: la confirmación no dice «de la IA». */
  borraDelChatOFases: boolean;
  /** Alguna tarea marcada nace en una fase nueva. */
  fasesNuevasConTareas: boolean;
  /** Las tareas de esta propuesta no llegaron («faltan» o «fallo»): se aplican solo las fases. */
  faltanTareas: boolean;
  estadoDeTareas: EstadoDeLasTareas | null;
  /** Cómo quedaría con lo marcado: la vista «Ver la propuesta» (una evaluación menos por render). */
  proyeccion: Proyeccion;
  /** E2c: las del plan (`PlanDeAplicacion`). */
  desfasadas: FaseDesfasada[];
  forzadas: FaseDesfasada[];
  bloqueoPorDesfasadas: boolean;
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
    case "fase-se-va":
      return `Se quita la fase «${nombreDeFase(vivo, c.faseId, c.desde.name)}»`;
    case "tarea-cambia":
      return `«${c.desde.title}» · ${textoDelCambioDeTarea(c, vivo, nuevas, "suelta")}`;
    default: {
      const _: never = c;
      return _;
    }
  }
}

const PARTY_EN_PALABRAS: Record<Party, string> = {
  CLIENTE: "la hace el cliente",
  SMARTEAM: "la hace el equipo",
  AMBOS: "la hacen juntos",
  DEV: "la hace desarrollo",
};

/**
 * E3: qué le cambia a una tarea viva, en palabras del CSE: «viene de «Diseño»», «pasa a S2»,
 * «renombrada a «Y»», «la hace el cliente», «pasa a sesión».
 * Revisión de E3 (#22): una mudanza se pinta en el grupo de su DESTINO («en-su-grupo»), que ya dice a
 * dónde va, y el renglón ya dice su semana: «pasa a «Pruebas», S3» repetía las dos cosas y callaba de
 * dónde venía. En su grupo dice su fase de origen, y la semana solo si cambia. «pasa a «X», S3» queda
 * para cuando se nombra suelta, fuera de un grupo.
 */
function textoDelCambioDeTarea(
  c: CambioTareaCambia,
  vivo: Vivo,
  nuevas: ReadonlyMap<string, CambioFaseNueva>,
  donde: "en-su-grupo" | "suelta",
): string {
  const partes: string[] = [];
  const destino = destinoDeLaCambia(c);
  if (destino !== null && donde === "en-su-grupo") {
    const origen = vivo.fases.find((f) => f.id === c.faseId)?.name;
    partes.push(origen ? `viene de «${origen}»` : "viene de otra fase");
    if (c.a.weekIndex !== undefined && c.a.weekIndex !== c.desde.weekIndex) partes.push(`pasa a S${c.a.weekIndex + 1}`);
  } else if (destino !== null) {
    const nombre = nuevas.get(destino)?.fase.name ?? nombreDeFase(vivo, destino, destino);
    partes.push(`pasa a «${nombre}», S${(c.a.weekIndex ?? c.desde.weekIndex) + 1}`);
  } else if (c.a.weekIndex !== undefined) {
    partes.push(`pasa a S${c.a.weekIndex + 1}`);
  }
  if (c.a.title !== undefined) partes.push(`renombrada a «${c.a.title}»`);
  if (c.a.party !== undefined) partes.push(c.a.party === null ? "sin dueño" : PARTY_EN_PALABRAS[c.a.party]);
  if (c.a.type !== undefined) partes.push(c.a.type === "SESSION" ? "pasa a sesión" : c.a.type === "TASK" ? "pasa a tarea" : "sin tipo");
  return partes.join(" · ");
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
  sin: ReadonlySet<string>,
): GrupoDeTareas[] {
  const desfasadas = new Map(plan.desfasadas.map((d) => [d.fase, d]));
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
  const nuevasPorClave = new Map(
    borrador.cambios.flatMap((c) => (c.tipo === "fase-nueva" ? [[c.clave, c] as const] : [])),
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
              : c.tipo === "tarea-cambia"
                ? "Ya está así."
                : "Ya no está en el cronograma."
            : undefined;
      const comun = {
        clave: c.clave,
        // E3: cómo la nombra el chat (la clave `t:` de una nueva; el id de una viva).
        ref: c.tipo === "tarea-nueva" ? c.clave : c.tareaId,
        estado: it.estado,
        ...(aviso ? { aviso } : {}),
        seMarca: (it.estado === "aplica" || it.estado === "excluido") && !heredada,
        ...(it.recalcula && !sin.has(c.clave) ? { enEspera: true } : {}),
      };
      if (c.tipo === "tarea-se-va") {
        return { ...comun, signo: "−" as const, titulo: c.desde.title, semana: c.desde.weekIndex + 1 };
      }
      if (c.tipo === "tarea-cambia") {
        // E3: «→» si se muda a este grupo (el del destino), «~» si cambia en su fase.
        return {
          ...comun,
          signo: destinoDeLaCambia(c) !== null ? ("→" as const) : ("~" as const),
          titulo: c.desde.title,
          semana: (c.a.weekIndex ?? c.desde.weekIndex) + 1,
          cambio: textoDelCambioDeTarea(c, vivo, nuevasPorClave, "en-su-grupo"),
        };
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
    /* Una desfasada se nombra como queda con lo marcado (E2c): si el CSE desmarcó el cambio de nombre,
       el grupo dice el nombre que se queda, no aquél para el que se armaron sus tareas. */
    const desfasada = desfasadas.get(fase);
    return {
      numero: k + i + 1,
      fase,
      nombre:
        desfasada?.nombre ?? borrador.tareasArmadasPara[fase]?.nombre ?? vivas.get(fase)?.name ?? fasesNuevas.get(fase) ?? fase,
      nuevas: vivos.filter((it) => it.cambio.tipo === "tarea-nueva").length,
      seVan: vivos.filter((it) => it.cambio.tipo === "tarea-se-va").length,
      cambian: vivos.filter((it) => it.cambio.tipo === "tarea-cambia").length,
      marcadas: its.filter((it) => it.estado === "aplica").length,
      aplicables: its.filter((it) => it.estado === "aplica" || it.estado === "excluido").length,
      estado: estadoDelGrupo(its),
      dependeDe,
      desfasada: desfasada !== undefined,
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
 * E2c: `forzar` va al plan tal cual, y el resumen lleva sus desfasadas y forzadas.
 */
export function resumir(
  vivo: Vivo,
  borrador: Borrador,
  sin: Iterable<string> = [],
  { tareas = null, forzar = [] }: { tareas?: EstadoDeLasTareas | null; forzar?: Iterable<string> } = {},
): ResumenDelBorrador {
  const sinLista = [...sin];
  const plan = planDeAplicacion(vivo, borrador, sinLista, { tareas, forzar });
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
    // E3: una fase que se va y se queda con lo que no se puede quitar lo dice en su renglón.
    const quedan = it.rescate?.length ?? 0;
    const nota =
      quedan > 0
        ? `Se queda con ${plural(quedan, "tarea con avance, cargada o editada a mano", "tareas con avance, cargadas o editadas a mano")}.`
        : undefined;
    return [
      {
        numero,
        clave: c.clave,
        estado: it.estado,
        titulo: tituloDe(c, vivo, nuevas),
        detalle,
        ...(motivo ? { motivo } : {}),
        ...(aviso ? { aviso } : {}),
        ...(nota ? { nota } : {}),
      },
    ];
  });
  const grupos = gruposDeTareas(vivo, borrador, plan, numeroEnLaLista, items.length, new Set(sinLista));

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
  // E3: las fases que se van (con cuántas pendientes se van con ella) y lo que dictó el chat.
  const fasesSeVan = (plan.escrituras.fasesQueSeVan ?? []).map((f) => ({
    nombre: nombreDeFase(vivo, f.id, f.id),
    borradas: f.borrar.length,
    queda: f.queda,
  }));
  const borraDelChat = plan.aplicadas.some((c) => c.tipo === "tarea-se-va" && c.porChat);

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
    tareas: {
      nuevas: escritas.nuevas.length,
      seVan: escritas.seVan.length,
      cambian: escritas.cambian?.length ?? 0,
      fasesSeVan,
      conLaFase: fasesSeVan.reduce((n, f) => n + f.borradas, 0),
    },
    borraAlgo: escritas.seVan.length > 0 || fasesSeVan.length > 0,
    borraDelChatOFases: borraDelChat || fasesSeVan.length > 0,
    fasesNuevasConTareas: escritas.nuevas.some((n) => n.fase.tipo === "nueva"),
    faltanTareas: tareas === "faltan" || tareas === "fallo",
    estadoDeTareas: tareas,
    proyeccion,
    desfasadas: plan.desfasadas,
    forzadas: plan.forzadas,
    bloqueoPorDesfasadas: plan.bloqueoPorDesfasadas,
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
 * El texto del botón de la barra. Revisión de E2c: con fases desfasadas sin forzar, sus tareas se ven
 * marcadas (esperan el recálculo) pero todavía no cuentan, y «Aplicar N de M» parecía decir que el CSE
 * las había quitado. Mientras tanto dice solo «Aplicar»: el botón está apagado y su `title` dice por qué.
 */
export function textoDelBotonDeAplicar(r: Pick<ResumenDelBorrador, "marcadas" | "aplicables" | "desfasadas">): string {
  return r.desfasadas.length > 0 ? "Aplicar" : textoDeAplicar(r.marcadas, r.aplicables);
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
  // E3: también las que cambian o se mudan.
  const tareas = r.grupos.reduce((n, g) => n + g.nuevas + g.seVan + (g.cambian ?? 0), 0);
  const otro = r.magnitud.esCronogramaNuevo ? "otro cronograma · " : "";
  if (tareas === 0) return `La IA propone ${otro}${plural(fases, "cambio", "cambios")}`;
  if (fases === 0) return `La IA propone ${otro}${plural(tareas, "cambio de tareas", "cambios de tareas")}`;
  return `La IA propone ${otro}${plural(fases, "cambio de fases", "cambios de fases")} y ${tareas} de tareas`;
}

/** Lo que dice la confirmación de aplicar, después del resumen de lo marcado. */
export function textoDeLaConfirmacion(
  r: Pick<ResumenDelBorrador, "borraAlgo" | "faltanTareas" | "fasesNuevasConTareas"> & {
    tareas: Pick<TareasDelResumen, "nuevas" | "seVan">;
    borraDelChatOFases?: boolean;
  },
): string {
  if (r.borraAlgo && r.borraDelChatOFases) {
    /* E3: lo que dictó el chat puede quitar una tarea pendiente que no es de la IA, y una fase se va
       con sus pendientes: no se dice «de la IA». Lo protegido sigue sin tocarse. */
    return (
      "Solo se quitan tareas pendientes: lo que tiene avance o se cargó a mano no se toca. " +
      "Después puedes seguir editando el cronograma a mano."
    );
  }
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
  r: Pick<ResumenDelBorrador, "marcadas" | "magnitudDeLoMarcado"> & {
    tareas: Pick<TareasDelResumen, "nuevas" | "seVan"> & Partial<TareasDelResumen>;
  },
): string {
  const frases = frasesDeCambios(r.magnitudDeLoMarcado);
  const { nuevas, seVan, cambian = 0, fasesSeVan = [] } = r.tareas;
  if (nuevas > 0) frases.push(`se ${nuevas === 1 ? "crea" : "crean"} ${plural(nuevas, "tarea", "tareas")}`);
  if (seVan > 0) {
    const verbo = seVan === 1 ? "quita" : "quitan";
    frases.push(nuevas > 0 ? `se ${verbo} ${seVan}` : `se ${verbo} ${plural(seVan, "tarea", "tareas")}`);
  }
  // E3: las que cambian y las fases que se van (con las pendientes que se llevan).
  if (cambian > 0) frases.push(`${cambian === 1 ? "cambia" : "cambian"} ${plural(cambian, "tarea", "tareas")}`);
  const pendientes = (n: number) => plural(n, "tarea pendiente", "tareas pendientes");
  const enteras = fasesSeVan.filter((f) => !f.queda);
  const conResto = fasesSeVan.filter((f) => f.queda);
  if (enteras.length === 1) {
    const f = enteras[0];
    frases.push(`se quita la fase «${f.nombre}»${f.borradas > 0 ? ` con ${f.borradas === 1 ? "su" : "sus"} ${pendientes(f.borradas)}` : ""}`);
  } else if (enteras.length > 1) {
    frases.push(`se quitan ${enteras.length} fases con ${pendientes(enteras.reduce((n, f) => n + f.borradas, 0))}`);
  }
  for (const f of conResto) {
    if (f.borradas > 0) frases.push(`de «${f.nombre}» se ${f.borradas === 1 ? "quita" : "quitan"} ${pendientes(f.borradas)}`);
  }
  const cuantos = r.marcadas === 1 ? "aplica el cambio marcado" : `aplican los ${r.marcadas} cambios marcados`;
  return `Se ${cuantos} de una sola vez${frases.length > 0 ? `: ${unirFrases(frases)}` : ""}.`;
}

export const ACCION_ARMAR_TAREAS = "Armar las tareas";
export const ACCION_VOLVER_A_INTENTAR = "Volver a intentar";
/** El botón chico que esconde la oferta de las tareas sin pedir nada. */
export const ACCION_AHORA_NO = "Ahora no";

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
 * «ofrecer» (E2b): ya no hay propuesta y sus tareas no llegaron; la línea ofrece armarlas
 * (`textoDeLaOfertaDeTareas`). Con `conCambiosDeFases`, lo resuelto fue aplicar sus fases.
 * `secundaria` (E2c P3): el texto del único botón chico secundario de la línea; solo «ofrecer» lo
 * trae («Ahora no»). La línea del recálculo usa el mismo botón para «Aplicar de todos modos».
 * `deLaFase` (revisión de E2b): el nombre de la fase de «Regenerar» de una fase, o null. Con él, la
 * espera dice cuál: si no, se leía igual que «Regenerar todo».
 */
export function textoDeLaLineaDeTareas(
  estado: EstadoDeLasTareas | "paso-1" | "ofrecer" | null,
  fase: string | null,
  motivo: string | null,
  conMaterial: boolean,
  conCambiosDeFases = true,
  deLaFase: string | null = null,
): { texto: string; accion: string | null; secundaria?: string | null } | null {
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
      return { texto: `${armandoLasTareas(deLaFase)} · ${fase?.trim() || "suele tardar uno o dos minutos"}`, accion: null };
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
    case "ofrecer":
      return { ...textoDeLaOfertaDeTareas(conCambiosDeFases), secundaria: ACCION_AHORA_NO };
    default:
      return null;
  }
}

/**
 * La oferta de armar las tareas después de resolver una propuesta que no las trajo («faltan» o
 * «fallo»), en la línea de las tareas (estado «ofrecer»). Con cambios de fases, se aplicaron y
 * faltan sus tareas. Sin ellos (el borrador vacío cuya corrida falló, descartado) no se decidió
 * ninguna fase: afirmarlo era falso (revisión de E2a). Cuándo se ofrece lo decide `pasoTrasResolver`.
 * E2b: vivía en su propia franja (`PasoDeTareasPendiente`, título y detalle), que se borró con la
 * cadena vieja. Menos texto: una oración y el botón.
 */
export function textoDeLaOfertaDeTareas(conCambiosDeFases: boolean): { texto: string; accion: string } {
  return conCambiosDeFases
    ? { texto: "Se aplicaron las fases; faltan sus tareas.", accion: ACCION_ARMAR_TAREAS }
    : { texto: "No se pudieron armar las tareas.", accion: ACCION_VOLVER_A_INTENTAR };
}

/**
 * El chip del encabezado mientras la IA trabaja: lo mismo que la línea de arriba del Gantt. «Revisando
 * fases y tiempos…» SOLO con material elegido: sin él, el paso 1 no revisa nada (vuelve «sin-material»).
 * Revisión de E2a: el chip lo decía siempre, y la línea de al lado decía otra cosa.
 */
export function textoDelChipDeEspera(enElPaso1: boolean, conMaterial: boolean, deLaFase: string | null = null): string {
  if (!enElPaso1) return armandoLasTareas(deLaFase);
  return conMaterial ? "Revisando fases y tiempos…" : "Preparando la propuesta…";
}

/** «Armando las tareas…», o «Armando las tareas de «X»…» en «Regenerar» de una fase (revisión de E2b). */
function armandoLasTareas(deLaFase: string | null): string {
  const nombre = deLaFase?.trim();
  return nombre ? `Armando las tareas de «${nombre}»…` : "Armando las tareas…";
}

/** ¿La propuesta guardada trae algún cambio de fases (o de fecha de arranque, u orden)? El handoff es
 *  solo de fases: sí. El borrador vacío del paso 2, o uno solo de tareas: no. Lo que no es un v1 (E4:
 *  esta versión no lo sabe leer) no trae nada que se sepa decir: no. */
export function traeCambiosDeFases(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
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
  return [...new Set([...delPaso1, ...deLaPropuesta].map(enUnaLinea).filter((o) => o.length > 0))];
}

/** Una observación en una sola línea (los espacios y saltos de adentro, uno solo): así viaja en el aviso
 *  de la corrida y así se comparan al juntarlas. En la franja no cambia nada: el HTML ya los junta. */
function enUnaLinea(o: string): string {
  return o.replace(/\s+/g, " ").trim();
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

/**
 * El título de lo que notó la IA y no aplica sola: el MISMO en la franja (ObservacionesDelPaso1, sin
 * barra) y en la barra de la propuesta (RevisionDeLaPropuesta). E2b P6: la franja decía otra cosa, y
 * lo que es lo mismo se lee igual en los dos lugares.
 */
export function tituloDeLoQueNoto(n: number): string {
  return n === 1
    ? "La IA también notó 1 cosa que no se aplica sola"
    : `La IA también notó ${n} cosas que no se aplican solas`;
}

export const AVISO_TAREAS_LISTAS = "Listas las tareas de la propuesta: revísala arriba del Gantt.";
export const AVISO_DETALLE_SIN_CAMBIOS = "La IA terminó y no propone cambios del cronograma.";

/**
 * Lo que deja escrito en la corrida (`timelineSyncError`) el paso 2 que terminó sin cambios y notó algo:
 * el desenlace en la primera línea y, debajo, una observación por línea. El texto completo queda en la
 * corrida; la pantalla lo lee con `leerAvisoSinCambios`. Revisión de E2b: el aviso era lo notado en los
 * dos pasos, pegado, y reemplazaba al desenlace: el CSE nunca leía que no había cambios, y lo del paso 1
 * salía otra vez en un toast de hasta 20 observaciones.
 */
export function avisoSinCambiosParaLaCorrida(observaciones: readonly string[]): string {
  return [AVISO_DETALLE_SIN_CAMBIOS, ...juntarObservaciones([], observaciones)].join("\n");
}

/** Lo notado de un aviso de `avisoSinCambiosParaLaCorrida`, o null si el aviso es otra cosa (el motivo
 *  de una corrida perdida, o uno de antes de la revisión de E2b). Puro. */
export function leerAvisoSinCambios(aviso: string | null | undefined): string[] | null {
  if (typeof aviso !== "string") return null;
  const [primera, ...resto] = aviso.trim().split("\n");
  if (primera.trim() !== AVISO_DETALLE_SIN_CAMBIOS) return null;
  return juntarObservaciones([], resto);
}

/** El toast del paso 2 que terminó sin cambios: SIEMPRE el desenlace y, a lo sumo, cuántas cosas notó.
 *  Lo notado lo muestra la franja «La IA también notó», no el toast (D7: no se alargan los toasts). */
export function avisoDelDetalleSinCambios(notadas: number): string {
  if (notadas <= 0) return AVISO_DETALLE_SIN_CAMBIOS;
  const cuantas = notadas === 1 ? "notó 1 cosa: la ves" : `notó ${notadas} cosas: las ves`;
  return `La IA terminó y no propone cambios del cronograma; ${cuantas} en «La IA también notó».`;
}
/** El chat no aplica con el borrador VACÍO cuya corrida falló: nadie va a traer nada, hay que sacarlo. */
export const CHAT_CON_EL_VACIO_FALLIDO =
  "No se pudieron armar las tareas del cronograma. Descarta la propuesta vacía arriba del Gantt y vuelve a aplicar: el acuerdo sigue acá.";

// ── LOS TEXTOS DEL RECÁLCULO (E2c) ───────────────────────────────────────────

/**
 * Los nombres de las fases, entre comillas: «X»; «X» y «Y»; «X» y N fases más. Sin ninguno (no
 * debería pasar), «una fase»: la frase sigue leyéndose.
 */
export function nombresEnTexto(nombres: readonly string[]): string {
  const citados = nombres.map((n) => `«${n.trim()}»`);
  if (citados.length === 0) return "una fase";
  if (citados.length <= 2) return unirFrases(citados);
  return `${citados[0]} y ${plural(citados.length - 1, "fase más", "fases más")}`;
}

/** El bloqueo de aplicar mientras haya fases desfasadas sin forzar. */
export const bloqueoPorDesfasadas = (nombres: readonly string[]): string =>
  `Las tareas de ${nombresEnTexto(nombres)} no calzan con lo que marcaste: recalcúlalas o desmárcalas para aplicar sin ellas.`;

/** El 409 de aplicar a una pestaña vieja que manda tareas desfasadas: no sabe recalcular. */
export const mensajeDeRecalculoAlAplicar = (nombres: readonly string[]): string =>
  `Las tareas de ${nombresEnTexto(nombres)} no calzan con lo que marcaste: recarga la página para recalcularlas o desmarcarlas.`;

/** El recálculo falló: la línea y el aviso del seguimiento dicen lo mismo, con la causa si la hay. */
export function textoDelFalloDelRecalculo(nombres: readonly string[], motivo: string | null): string {
  const m = motivo?.trim().replace(/[.\s]+$/, "");
  return `No se pudieron recalcular las tareas de ${nombresEnTexto(nombres)}${m ? `: ${m}` : ""}.`;
}

/** El aviso de que llegaron las tareas recalculadas. */
export const avisoDeTareasRecalculadas = (nombres: readonly string[]): string =>
  `Listas las tareas recalculadas de ${nombresEnTexto(nombres)}.`;

/** Lo que dijo el GET del cronograma al releer la propuesta, después de seguir la corrida de sus tareas. */
export interface LecturaTrasLaCorrida {
  /** Hay una propuesta guardada, del formato que sea. */
  hayPropuesta: boolean;
  /** Las tareas del `borrador-v1` guardado (su corrida, su estado y por qué fallaron), o null si no espera. */
  tareas: { corrida: string | null; estado: EstadoDeLasTareas; motivo: string | null } | null;
  /** E2c: el recálculo del borrador guardado, o null si no hay (se fusionó entero o nunca hubo). */
  recalculo?: RecalculoEnElCable | null;
}

export type DesenlaceDelSeguimiento =
  /** Todavía no se sabe (sigue armando, o el GET falló): se vuelve a seguir, sin avisar ni darla por avisada. */
  | { que: "seguir" }
  /** La propuesta guardada ya no es la de esta corrida (se descartó o la reemplazó otra): nada que avisar. */
  | { que: "callar" }
  | {
      que: "avisar";
      ok: boolean;
      tono: "exito" | "info" | "error";
      texto: string;
      /** Revisión de E2b: lo que notó la IA en una corrida que terminó sin cambios. Va a la franja «La IA
       *  también notó», no al toast. Ausente = nada que sumar. */
      observaciones?: string[];
    };

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
 *     dejó la corrida (o que no propone cambios). Revisión de E2b: si dejó lo que notó
 *     (`avisoSinCambiosParaLaCorrida`), el toast dice el desenlace y cuántas cosas, y lo notado sale
 *     aparte (`observaciones`) para la franja.
 * El descarte hecho en ESTA pantalla lo calla quien descarta, antes de que la corrida termine.
 * E2c: si lo que se sigue es un RECÁLCULO (`recalculo`: los nombres de sus fases, tomados al empezar
 * a seguir), se mira su propio estado, no el de las tareas: sin esta rama terminaba mudo (las tareas
 * del borrador siguen «listas» y caía en «otra propuesta → callar»).
 *   · El recálculo guardado es el de esta corrida: «armando» → se sigue; si no, falló (con su motivo).
 *   · Es otro: se calla. No hay ninguno: se fusionó entero (DONE con propuesta) → se avisa que llegaron.
 */
export function desenlaceDelSeguimiento(i: {
  corrida: string;
  estado: "DONE" | "ERROR" | "TIMEOUT";
  lectura: LecturaTrasLaCorrida | null;
  /** Lo que dejó dicho la corrida al terminar sin tareas (`timelineSyncError`). */
  aviso?: string | null;
  /** E2c: la corrida es un recálculo; los nombres de sus fases, tomados al empezar a seguirla. */
  recalculo?: readonly string[] | null;
}): DesenlaceDelSeguimiento {
  if (i.lectura === null) return { que: "seguir" };
  if (i.recalculo) {
    const r = i.lectura.recalculo ?? null;
    if (r !== null) {
      if (r.corrida !== i.corrida) return { que: "callar" };
      if (r.estado === "armando") return { que: "seguir" };
      return { que: "avisar", ok: false, tono: "error", texto: textoDelFalloDelRecalculo(r.nombres, r.motivo) };
    }
    return i.lectura.hayPropuesta && i.estado === "DONE"
      ? { que: "avisar", ok: true, tono: "exito", texto: avisoDeTareasRecalculadas(i.recalculo) }
      : { que: "callar" };
  }
  const t = i.lectura.tareas;
  if (t !== null && t.corrida === i.corrida) {
    if (t.estado === "armando") return { que: "seguir" };
    if (t.estado === "listas") {
      return { que: "avisar", ok: true, tono: "exito", texto: AVISO_TAREAS_LISTAS };
    }
    if (t.estado === "fallo") {
      const texto = textoDeLaLineaDeTareas("fallo", null, t.motivo, false, false)?.texto ?? "No se pudieron armar las tareas.";
      return { que: "avisar", ok: false, tono: "error", texto };
    }
    return { que: "callar" };
  }
  if (i.lectura.hayPropuesta || i.estado !== "DONE") return { que: "callar" };
  const aviso = i.aviso?.trim() ?? "";
  /* Revisión de E2b: el paso 2 sin cambios que notó algo. El toast dice el desenlace y cuántas; lo
     notado va a la franja. */
  const notadas = leerAvisoSinCambios(aviso);
  if (notadas) {
    return {
      que: "avisar",
      ok: true,
      tono: "info",
      texto: avisoDelDetalleSinCambios(notadas.length),
      ...(notadas.length > 0 ? { observaciones: notadas } : {}),
    };
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// ── EL ESTADO DE LA REVISIÓN EN PANTALLA (puro, lo usa el hook) ──────────────
// ─────────────────────────────────────────────────────────────────────────────

export type VistaDelBorrador = "propuesta" | "antes";

/**
 * Lo que la pantalla recuerda de UNA propuesta: lo desmarcado (en memoria: viaja como `sin` al
 * aplicar) y qué vista está mirando. `clave` identifica la propuesta: si cambia, todo vuelve a empezar.
 * E4: ya no hay foto. Un v1 trae su `desde` guardado; la foto solo servía para convertir el formato
 * viejo, que ya no se lee.
 */
export interface EstadoDeRevision {
  clave: string | null;
  sin: ReadonlySet<string>;
  vista: VistaDelBorrador;
}

export const REVISION_VACIA: EstadoDeRevision = { clave: null, sin: new Set(), vista: "propuesta" };

/**
 * La identidad de lo que hay guardado, o null si no es un v1. E2a: un v1 trae su `desde` y sube
 * `version` en cada escritura (la marca y la fusión de las tareas). Su identidad es el TOKEN: lo
 * desmarcado sobrevive a que lleguen las tareas.
 */
export function claveDeRevision(json: unknown, token: string | null): string | null {
  return esBorradorV1(json) ? `${token ?? ""}|v1` : null;
}

/** JSON con las claves de cada objeto ordenadas: el mismo contenido da siempre el mismo texto. La usa
 *  la huella del plan (`tarea-cambia`, E3). */
export function jsonCanonico(v: unknown): string {
  return JSON.stringify(v, (_k, valor: unknown) =>
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? Object.fromEntries(Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : valor,
  );
}

/**
 * Una propuesta distinta: se mira la propuesta, con lo desmarcado que se recuerde de ESA misma
 * propuesta (volver a entrar o recargar), o con nada desmarcado.
 */
export function revisionPara(clave: string | null, recuerdo: RecuerdoDeLaRevision | null = null): EstadoDeRevision {
  if (clave === null) return REVISION_VACIA;
  return { clave, sin: new Set(recuerdo?.sin ?? []), vista: "propuesta" };
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
// ── E3: LAS CASILLAS GUARDADAS Y LA APERTURA DEL CHAT (puro) ─────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// Desde E3 lo desmarcado se guarda en el servidor (`excluidos` del JSON): lo ve cualquier computadora.
// Lo escriben la barra y el chat por UNA ruta (POST /timeline/borrador/operaciones) y cada escritura
// sube `version`. ⛔ El plan NUNCA lee `excluidos`: aplicar sigue leyendo el `sin` del cuerpo, así una
// pestaña de antes no entra en un bucle de PLAN_CAMBIO.

/** Los techos de lo desmarcado guardado (los mismos que `leerExcluidos`). */
const MAX_EXCLUIDOS = 2000;
const MAX_LARGO_DE_CLAVE = 300;
/** Cuántas personas recuerda `chatAbiertoPara` (las más recientes). */
const MAX_ABIERTO_PARA = 50;

/** Una escritura de casillas: excluir (desmarcar) o incluir (marcar) unas claves. */
export interface OperacionDeCasillas {
  op: "excluir" | "incluir";
  claves: string[];
}

/** Lo desmarcado guardado en un `borrador-v1`, o null si el campo falta (o no tiene forma válida). */
export function excluidosDelGuardado(json: unknown): string[] | null {
  if (!esBorradorV1(json) || !("excluidos" in json)) return null;
  return leerExcluidos(json.excluidos);
}

/**
 * Lo desmarcado, limpio: sin repetidos y con sus techos (2000 claves de 1 a 300 caracteres). Poda SOLO
 * las claves `t:` y `n:` que ya no están (son aleatorias: nunca se repiten). Las demás se conservan aunque
 * su cambio no esté hoy: `tarea:X:se-va` vuelve con un recálculo, y tiene que volver desmarcada.
 */
export function normalizarExcluidos(b: Pick<Borrador, "cambios">, claves: Iterable<string>): string[] {
  const presentes = new Set(b.cambios.map((c) => c.clave));
  const out: string[] = [];
  const vistas = new Set<string>();
  for (const k of claves) {
    if (!esTextoEntre(k, 1, MAX_LARGO_DE_CLAVE) || vistas.has(k)) continue;
    if ((k.startsWith("t:") || k.startsWith("n:")) && !presentes.has(k)) continue;
    vistas.add(k);
    out.push(k);
  }
  return out.slice(0, MAX_EXCLUIDOS);
}

/** Lo desmarcado después de unas casillas, en orden. Una clave que el borrador no tiene se ignora. */
export function aplicarCasillas(
  b: Pick<Borrador, "cambios">,
  excluidos: readonly string[],
  ops: readonly OperacionDeCasillas[],
): string[] {
  const conocidas = new Set(b.cambios.map((c) => c.clave));
  const out = [...excluidos];
  for (const op of ops) {
    for (const clave of op.claves) {
      if (!conocidas.has(clave)) continue;
      const i = out.indexOf(clave);
      if (op.op === "excluir" && i < 0) out.push(clave);
      else if (op.op === "incluir" && i >= 0) out.splice(i, 1);
    }
  }
  return out;
}

/** Lo desmarcado que ve la pantalla: lo del servidor con los clics que todavía no subieron encima. */
export function superponerCasillas(servidor: Iterable<string>, pendientes: readonly OperacionDeCasillas[]): Set<string> {
  const sin = new Set(servidor);
  for (const op of pendientes) {
    for (const clave of op.claves) {
      if (op.op === "excluir") sin.add(clave);
      else sin.delete(clave);
    }
  }
  return sin;
}

/** La huella de una persona (su email, sin mayúsculas ni espacios): el JSON no guarda emails. */
export const huellaDePersona = (email: string): string => huellaDeTexto(email.trim().toLowerCase());

/** Las huellas de `chatAbiertoPara` (crudo, las últimas 50). Fuera del tipo `Borrador` y de la huella. */
export function leerAbiertoPara(json: unknown): string[] {
  if (!esBorradorV1(json) || !Array.isArray(json.chatAbiertoPara)) return [];
  return json.chatAbiertoPara.filter((h): h is string => esTextoEntre(h, 1, 64)).slice(-MAX_ABIERTO_PARA);
}

/** ¿El chat ya se abrió solo para esta persona con este borrador? */
export function abiertoPara(json: unknown, email: string | null | undefined): boolean {
  if (!email || !email.trim()) return false;
  return leerAbiertoPara(json).includes(huellaDePersona(email));
}

/** La lista de `chatAbiertoPara` con esta persona sumada (las últimas 50). */
export function conAbiertoPara(json: unknown, email: string): string[] {
  const h = huellaDePersona(email);
  const lista = leerAbiertoPara(json).filter((x) => x !== h);
  return [...lista, h].slice(-MAX_ABIERTO_PARA);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO DESMARCADO SE RECUERDA (en el navegador) ──────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//
// El cronograma se DESMONTA al cambiar de canvas (Handoff, Kickoff…) y se remonta al terminar
// «Chequear avance»; recargar también empieza de cero. Lo desmarcado se recuerda por PROYECTO, atado a
// la identidad de la propuesta (`claveDeRevision`): una propuesta distinta arranca sin nada
// desmarcado. Una sola entrada por proyecto: la propuesta nueva pisa la vieja, y aplicar o descartar
// la borra. Desde E3 lo desmarcado vive en el servidor (`excluidos`); esta entrada queda para la
// migración única de E3, que la sube la primera vez.
// E4: la FOTO se fue (solo servía para convertir el formato viejo). Una entrada escrita antes, con
// `foto`, se sigue leyendo: se toma solo `sin`, y la clave del almacén no cambió de texto.

/** Lo mínimo de `Storage` que usa la pantalla: `localStorage` en el navegador, un Map en los tests. */
export interface AlmacenDeFotos {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** Lo que se recuerda de una propuesta: lo desmarcado. */
export interface RecuerdoDeLaRevision {
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

/**
 * Dónde vive lo recordado de la propuesta abierta de un proyecto: UNA entrada por proyecto.
 * ⛔ El texto de la clave NO cambia (dice «foto» por historia): lo desmarcado antes de E4 se sigue
 * leyendo, y la migración única de E3 lo sube.
 */
export const claveDelRecuerdo = (projectId: string): string => `nexus:cronograma:foto-de-la-propuesta:${projectId}`;

/**
 * Lo desmarcado recordado para ESA propuesta (`revision` = `claveDeRevision`), o null: no hay, es de
 * otra propuesta, está rota o el navegador no deja leer. Nunca tira. E4: una entrada con `foto` (la
 * escribía la versión anterior) vale igual; la foto se ignora.
 */
export function recuerdoDeLaRevision(
  almacen: AlmacenDeFotos | null,
  projectId: string,
  revision: string,
): RecuerdoDeLaRevision | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(claveDelRecuerdo(projectId));
    if (!crudo) return null;
    const json: unknown = JSON.parse(crudo);
    if (!esObjeto(json) || json.revision !== revision) return null;
    const sin = Array.isArray(json.sin) ? json.sin.filter((s): s is string => typeof s === "string") : [];
    return { sin };
  } catch {
    return null;
  }
}

/** Guarda lo desmarcado de esa propuesta (pisa lo de la propuesta anterior del proyecto). */
export function recordarRevision(
  almacen: AlmacenDeFotos | null,
  projectId: string,
  revision: string,
  recuerdo: RecuerdoDeLaRevision,
): void {
  if (!almacen) return;
  try {
    almacen.setItem(claveDelRecuerdo(projectId), JSON.stringify({ revision, sin: recuerdo.sin }));
  } catch {
    /* sin lugar o sin permiso: la revisión sigue en memoria, como antes */
  }
}

/** La propuesta se resolvió (aplicada o descartada): lo recordado ya no sirve. */
export function olvidarRevision(almacen: AlmacenDeFotos | null, projectId: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(claveDelRecuerdo(projectId));
  } catch {
    /* nada que hacer: la próxima propuesta la pisa */
  }
}
