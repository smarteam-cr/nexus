/**
 * lib/timeline/recalculo-de-tareas.ts — EL RECÁLCULO DE LAS TAREAS DE UNA FASE DESFASADA (E2c), EN PANTALLA.
 *
 * Puro y client-safe. Si el CSE quita un cambio de fase (el de semanas de «Pruebas», por ejemplo), las
 * tareas de esa fase quedaron armadas para otra forma: la fase está DESFASADA (lib/timeline/borrador.ts,
 * `FaseDesfasada`) y sus tareas se recalculan solas, en UNA corrida para todas, tras una espera corta
 * desde la última casilla. Acá vive lo que decide la pantalla, para probarlo fuera del Canvas:
 *   · la espera (`trasLaMarca`, `alVencer`): cuándo arranca, cuándo se lanza y cuándo no;
 *   · cuándo se puede lanzar (`puedeLanzarElRecalculo`) y el pedido entero (`pedirElRecalculo`, con lo
 *     de la pantalla inyectado);
 *   · qué se ve (`recalculoEnPantalla`) y los textos de la línea, del grupo y de «Aplicar de todos modos»;
 *   · lo que trae el GET de las tareas de la propuesta (`tareasDelGet`) y sus corridas
 *     (`corridasDeLaPropuesta`).
 * Importa de borrador.ts, nunca al revés.
 *
 * Revisión de E2c (2026-09-25): lo que el Canvas armaba solo (cómo llega el recálculo del GET a la barra,
 * el pedido y cuándo se puede lanzar) vive acá para que sus guardas lo LLAMEN (recalculo-en-la-pantalla.test.ts).
 */
import {
  ACCION_VOLVER_A_INTENTAR,
  esBorradorV1,
  leerBorrador,
  nombresEnTexto,
  textoDelFalloDelRecalculo,
  type EstadoDeLasTareas,
  type FaseDesfasada,
  type RecalculoEnElCable,
  type TareasDelBorrador,
} from "./borrador";
import { AVISO_PROPUESTA_PENDIENTE } from "./propuesta-de-estructura";
import { plural } from "./weeks";

/** La espera desde la última casilla antes de lanzar el recálculo: dos casillas seguidas pagan UNA corrida. */
export const ESPERA_DEL_RECALCULO_MS = 4000;
export const ACCION_RECALCULAR = "Recalcular las tareas";
export const ACCION_APLICAR_DE_TODOS_MODOS = "Aplicar de todos modos";

const normalizar = (s: string) => s.trim().toLowerCase();

/** Cada fase (su id) con la forma que va a tener. */
export type FormasPorFase = ReadonlyMap<string, string>;

/** Las fases desfasadas, cada una con la forma que va a tener («nombre-normalizado:semanas:sesiones:0|1»). */
export function formasDeDesfasadas(d: readonly FaseDesfasada[]): Map<string, string> {
  return new Map(
    d.map((f) => [f.fase, `${normalizar(f.forma.nombre)}:${f.forma.semanas}:${f.forma.sesiones ?? ""}:${f.forma.semanaCero ? 1 : 0}`]),
  );
}

const claveDeFormas = (formas: FormasPorFase): string =>
  [...formas]
    .map(([fase, forma]) => `${fase}:${forma}`)
    .sort()
    .join("|");

/**
 * La identidad de lo que hay que recalcular: cada fase con la forma que va a tener. Si no cambia, no
 * hay nada nuevo que pedir. "" sin ninguna.
 */
export function claveDeDesfasadas(d: readonly FaseDesfasada[]): string {
  return claveDeFormas(formasDeDesfasadas(d));
}

/**
 * ¿Hay alguna fase con una forma que todavía no se lanzó? `lanzadas` guarda, POR FASE, la última forma
 * que se pidió. Revisión de E2c: antes se comparaba el conjunto entero contra el último lanzado, y si el
 * conjunto se achicaba tras un fallo («Pruebas|Diseño» → «Diseño»), la clave salía «nueva» y se volvía a
 * pagar la forma que acababa de fallar.
 */
export function hayFormasSinLanzar(formas: FormasPorFase, lanzadas: FormasPorFase): boolean {
  for (const [fase, forma] of formas) if (lanzadas.get(fase) !== forma) return true;
  return false;
}

/**
 * Tras una casilla del CSE: ¿arranca (o vuelve a empezar) la espera? Solo si puede pedir, hay algo que
 * recalcular que TODAVÍA NO SE LANZÓ (revisión de E2c: tras un fallo, marcar y desmarcar el mismo cambio
 * decía «Recalculando…» 4 s sin lanzar nada) y cambió lo que hay que recalcular (o ya estaba esperando:
 * la espera cuenta desde la última casilla).
 */
export function trasLaMarca(i: {
  antes: string;
  formas: FormasPorFase;
  lanzadas: FormasPorFase;
  esperando: boolean;
  puedePedir: boolean;
}): boolean {
  const ahora = claveDeFormas(i.formas);
  return i.puedePedir && ahora !== "" && hayFormasSinLanzar(i.formas, i.lanzadas) && (ahora !== i.antes || i.esperando);
}

export type AlVencer = { que: "nada" } | { que: "esperar" } | { que: "lanzar"; automatico: boolean };

/**
 * Al vencer la espera, con lo de ESE momento.
 *   · «nada»: sin permiso, sin nada que recalcular, o (sola) ninguna fase con una forma sin lanzar: la
 *     misma forma no se relanza sola, tras un fallo la línea ofrece «Volver a intentar» (`aMano`, que sí
 *     la relanza). También si no se puede lanzar y esperar no sirve (sin tareas en pantalla): si no, la
 *     línea diría «Recalculando…» para siempre sin que corra nada.
 *   · «esperar»: todavía no se puede lanzar (otra corrida, un pedido en vuelo, aplicando…): otra vuelta.
 *   · «lanzar»: se pide; `automatico` si lo lanzó la espera (sin avisos), no si fue el botón.
 */
export function alVencer(i: {
  formas: FormasPorFase;
  lanzadas: FormasPorFase;
  aMano: boolean;
  enVuelo: boolean;
  puedePedir: boolean;
  puedeLanzar: boolean;
  puedeEsperar: boolean;
}): AlVencer {
  if (!i.puedePedir || i.formas.size === 0) return { que: "nada" };
  if (!i.aMano && !hayFormasSinLanzar(i.formas, i.lanzadas)) return { que: "nada" };
  if (i.enVuelo) return { que: "esperar" };
  if (!i.puedeLanzar) return i.puedeEsperar ? { que: "esperar" } : { que: "nada" };
  return { que: "lanzar", automatico: !i.aMano };
}

/**
 * ¿Se puede lanzar el recálculo AHORA, y sirve esperar a que se pueda? Se lanza con quien edita, con la
 * propuesta en pantalla, sin otro pedido, aplicar ni descartar en curso, con las tareas listas y sin otro
 * recálculo corriendo. Esperar sirve solo con tareas en pantalla: sin ellas (la propuesta se resolvió en
 * otra pestaña) no va a poder nunca. (E4, 2026-09: se fue el freno de la vista previa de «Pedir cambio
 * con IA», que se retiró.)
 */
export function puedeLanzarElRecalculo(i: {
  puedeEditar: boolean;
  hayBorrador: boolean;
  armando: boolean;
  aplicando: boolean;
  descartando: boolean;
  tareas: { estado: EstadoDeLasTareas; recalculo?: RecalculoEnElCable | null } | null;
}): { puedeLanzar: boolean; puedeEsperar: boolean } {
  const t = i.tareas;
  return {
    puedeLanzar:
      i.puedeEditar &&
      i.hayBorrador &&
      !i.armando &&
      !i.aplicando &&
      !i.descartando &&
      t !== null &&
      t.estado === "listas" &&
      t.recalculo?.estado !== "armando",
    puedeEsperar: t !== null,
  };
}

const esListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const textoONulo = (v: unknown): string | null | undefined => (v === null ? null : typeof v === "string" ? v : undefined);

/** El recálculo que viaja en el GET (dentro de `tareasDelBorrador`), validado. null = no hay o no vale. */
export function leerRecalculoDelCable(json: unknown): RecalculoEnElCable | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const v = json as Record<string, unknown>;
  if (v.estado !== "armando" && v.estado !== "fallo") return null;
  if (typeof v.corrida !== "string" || v.corrida.length === 0) return null;
  if (!esListaDeTextos(v.fases) || !esListaDeTextos(v.nombres) || v.fases.length !== v.nombres.length) return null;
  const fase = textoONulo(v.fase);
  const motivo = textoONulo(v.motivo);
  if (fase === undefined || motivo === undefined) return null;
  return { estado: v.estado, corrida: v.corrida, fases: [...v.fases], nombres: [...v.nombres], fase, motivo };
}

/* ── LAS TAREAS DE LA PROPUESTA EN PANTALLA (E2a del borrador; acá desde la revisión de E2c) ─────────
   «Regenerar todo» deja UN `borrador-v1` con fases y tareas; las tareas las arma una corrida aparte.
   Su estado («armando», «faltan», «fallo», «listas») NO se guarda: lo calcula el servidor en el GET
   del cronograma, de la corrida. Viaja junto con el token y la corrida del MISMO GET: así el estado
   nunca se lee contra otra propuesta, y se sabe qué corrida seguir. */
export interface TareasDelBorradorEnPantalla {
  estado: EstadoDeLasTareas;
  /** La fase que reporta la corrida («armando»). */
  fase: string | null;
  /** Por qué falló («fallo»). */
  motivo: string | null;
  /** El token (`pendingProposalRunId`) de la propuesta a la que corresponde el estado. */
  token: string | null;
  /** La corrida que arma (o armó) las tareas. */
  corrida: string | null;
  /** E2c: el recálculo de las tareas de las fases desfasadas (su estado lo deduce el servidor de SU
   *  corrida), o null/ausente si no hay. */
  recalculo?: RecalculoEnElCable | null;
}

const ESTADOS_DE_TAREAS: readonly EstadoDeLasTareas[] = ["listas", "faltan", "armando", "fallo"];

/** Las tareas que espera el `borrador-v1` guardado (su corrida y si ya llegaron), o null. */
function tareasDelGuardado(json: unknown): TareasDelBorrador | null {
  return esBorradorV1(json) ? (leerBorrador(json)?.tareas ?? null) : null;
}

/** Lo que el GET del cronograma dice de las tareas de la propuesta guardada, o null si no espera. */
export function tareasDelGet(data: {
  tareasDelBorrador?: unknown;
  pendingProposal?: unknown;
  pendingProposalRunId?: unknown;
}): TareasDelBorradorEnPantalla | null {
  const t = data.tareasDelBorrador as { estado?: unknown; fase?: unknown; motivo?: unknown; recalculo?: unknown } | null | undefined;
  if (!t || !ESTADOS_DE_TAREAS.includes(t.estado as EstadoDeLasTareas)) return null;
  return {
    estado: t.estado as EstadoDeLasTareas,
    fase: typeof t.fase === "string" ? t.fase : null,
    motivo: typeof t.motivo === "string" ? t.motivo : null,
    token: typeof data.pendingProposalRunId === "string" ? data.pendingProposalRunId : null,
    corrida: tareasDelGuardado(data.pendingProposal)?.corrida ?? null,
    recalculo: leerRecalculoDelCable(t.recalculo),
  };
}

/**
 * Las corridas de la propuesta en pantalla: la que arma sus tareas y la de su recálculo. Al descartarla
 * (o aplicarla) se dan por avisadas: su seguimiento sigue vivo y, si en ese rato entra otra propuesta,
 * avisaría «Listas las tareas recalculadas…» sobre la otra (revisión de E2c).
 */
export function corridasDeLaPropuesta(t: Pick<TareasDelBorradorEnPantalla, "corrida" | "recalculo"> | null): string[] {
  if (!t) return [];
  return [t.corrida, t.recalculo?.corrida ?? null].filter((c): c is string => !!c);
}

/** Lo mínimo de una respuesta de `fetch` que usa el pedido. */
export interface RespuestaDelPedido {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Lo de la pantalla que usa el pedido del recálculo, siempre leído en el momento (el Canvas lo inyecta). */
export interface PedidoDelRecalculo {
  clientId: string;
  projectId: string;
  /** La propuesta en pantalla AHORA: su token y si se puede pedir sobre ella (un borrador que no se está
   *  descartando). */
  propuesta: () => { token: string | null; sePuedePedir: boolean };
  /** Lo editado a mano, en la base (el servidor compara contra ella): el motivo si no se pudo. */
  esperarQueSeGuarde: () => Promise<string | null>;
  /** E3: lo marcado, en la base (cada casilla sube la versión): el motivo si no se pudo. */
  esperarCasillas: () => Promise<string | null>;
  /** Lo de la revisión AHORA (el guardado pudo moverlo). */
  revision: () => { sin: Iterable<string>; version: number | null; desfasadas: readonly FaseDesfasada[] };
  fetch: (url: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<RespuestaDelPedido>;
  /** Trae la propuesta guardada (con su recálculo «armando»: el seguimiento lo toma). */
  traerPropuesta: () => Promise<unknown>;
  /** Relee el cronograma vivo. */
  recargar: () => Promise<unknown>;
  avisar: (tono: "info" | "error", texto: string) => void;
}

/**
 * El pedido del recálculo: el paso 2 sobre ESTA propuesta con `recalcular: { sin }` (todo lo
 * desmarcado); qué fases recalcular lo calcula el servidor. Primero lo editado y lo marcado en la base, y
 * se lee lo de ESE momento: si ya no hay nada que recalcular, o la propuesta cambió, no se pide.
 * `automatico`: lo lanzó la espera, sin avisos salvo un error.
 * ⛔ No usa `armando` ni el pedido del paso 2 entero: `armando` frena el chat y «Generar», y su «Volver a
 * intentar» arma TODAS las fases.
 */
export async function pedirElRecalculo(p: PedidoDelRecalculo, automatico: boolean): Promise<void> {
  const { token, sePuedePedir } = p.propuesta();
  if (!sePuedePedir) return;
  const sinGuardar = await p.esperarQueSeGuarde();
  if (sinGuardar) {
    if (!automatico) p.avisar("error", sinGuardar);
    return;
  }
  if (await p.esperarCasillas()) return;
  const { sin, version, desfasadas } = p.revision();
  const ahora = p.propuesta();
  if (desfasadas.length === 0 || !ahora.sePuedePedir || ahora.token !== token) return;
  try {
    const res = await p.fetch(`/api/clients/${p.clientId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: 1,
        step: 0,
        stepLabel: "Recalcular tareas",
        sectionLabel: "Recalcular tareas",
        agentId: "agent-timeline-detail",
        projectId: p.projectId,
        async: true,
        borrador: { token, version, recalcular: { sin: [...sin] } },
      }),
    });
    const data = ((await res.json().catch(() => ({}))) ?? {}) as { error?: unknown; message?: unknown };
    const mensaje = typeof data.message === "string" ? data.message : null;
    if (res.ok) {
      // La propuesta quedó con su recálculo «armando»: se trae, y el seguimiento lo toma.
      await p.traerPropuesta();
      return;
    }
    if (res.status === 409) {
      // Lo vivo cambió en la base: la pantalla veía otra cosa que recalcular.
      if (data.error === "NADA_QUE_RECALCULAR") await p.recargar();
      await p.traerPropuesta();
      if (!automatico && data.error !== "TAREAS_EN_CURSO" && data.error !== "NADA_QUE_RECALCULAR") {
        p.avisar("info", mensaje ?? AVISO_PROPUESTA_PENDIENTE);
      }
      return;
    }
    p.avisar("error", mensaje ?? "No se pudieron recalcular las tareas.");
  } catch {
    p.avisar("error", "Error de conexión al recalcular las tareas.");
  }
}

export interface RecalculoEnPantalla {
  que: "esperando" | "armando" | "fallo" | "pendiente";
  /** Las fases de las que habla la línea. */
  fases: Array<{ id: string; nombre: string }>;
  /** «armando»: las desfasadas que no entran en la corrida que corre y que la espera va a lanzar al
   *  terminar. Solo con una espera viva: sin ella nadie las lanza (revisión de E2c). */
  despues: Array<{ id: string; nombre: string }>;
  /** La fase de la corrida («Leyendo las reuniones»), solo en «armando». */
  fase: string | null;
  /** Por qué falló, solo en «fallo». */
  motivo: string | null;
}

/**
 * Qué se ve del recálculo, en este orden (D son las desfasadas; S, las fases del recálculo guardado):
 *   1. el servidor recalcula y hay desfasadas → «armando», con las que entran (D ∩ S) y, si la espera
 *      está viva, las que siguen después (D − S). Sin espera (recargaste, o no puedes pedir), nadie las
 *      lanza: su grupo dice «falta recalcularlas» y, al terminar la corrida, la línea ofrece recalcularlas;
 *   2. la espera corre → «esperando»;
 *   3. el recálculo falló y cubre TODAS las desfasadas (D ⊆ S) → «fallo» (si no, falta pedir alguna);
 *   4. hay desfasadas → «pendiente»;
 *   5. si no, nada.
 */
export function recalculoEnPantalla(i: {
  desfasadas: readonly FaseDesfasada[];
  esperando: boolean;
  servidor: RecalculoEnElCable | null;
  faseDeLaCorrida: string | null;
}): RecalculoEnPantalla | null {
  const d = i.desfasadas.map((f) => ({ id: f.fase, nombre: f.nombre }));
  if (d.length === 0) return null;
  const s = new Set(i.servidor?.fases ?? []);
  if (i.servidor?.estado === "armando") {
    return {
      que: "armando",
      fases: d.filter((f) => s.has(f.id)),
      despues: i.esperando ? d.filter((f) => !s.has(f.id)) : [],
      fase: i.faseDeLaCorrida,
      motivo: null,
    };
  }
  if (i.esperando) return { que: "esperando", fases: d, despues: [], fase: null, motivo: null };
  if (i.servidor?.estado === "fallo" && d.every((f) => s.has(f.id))) {
    return { que: "fallo", fases: d, despues: [], fase: null, motivo: i.servidor.motivo };
  }
  return { que: "pendiente", fases: d, despues: [], fase: null, motivo: null };
}

const nombresDe = (fases: ReadonlyArray<{ nombre: string }>) => fases.map((f) => f.nombre);
const DESMARCALAS = " Desmárcalas para aplicar sin ellas.";

/**
 * La línea del recálculo arriba del Gantt. `puedePedir`: quien mira puede recalcular (la misma vara
 * que «Armar las tareas»); sin permiso no hay botones y se le dice la salida que sí tiene.
 */
export function textoDelRecalculo(
  e: RecalculoEnPantalla,
  o: { puedePedir: boolean },
): { texto: string; accion: string | null; secundaria: string | null; enCurso: boolean } {
  if (e.que === "esperando" || e.que === "armando") {
    const despues = e.despues.length > 0 ? `después, ${nombresEnTexto(nombresDe(e.despues))}` : null;
    if (e.fases.length === 0) {
      return { texto: `Recalculando otras tareas… · ${despues ?? "alrededor de un minuto"}`, accion: null, secundaria: null, enCurso: true };
    }
    const cola = despues ?? (e.fase?.trim() || "alrededor de un minuto");
    return {
      texto: `Recalculando las tareas de ${nombresEnTexto(nombresDe(e.fases))}… · ${cola}`,
      accion: null,
      secundaria: null,
      enCurso: true,
    };
  }
  if (e.que === "pendiente") {
    const texto = `Las tareas de ${nombresEnTexto(nombresDe(e.fases))} no calzan con lo que marcaste.`;
    return o.puedePedir
      ? { texto, accion: ACCION_RECALCULAR, secundaria: null, enCurso: false }
      : { texto: `${texto}${DESMARCALAS}`, accion: null, secundaria: null, enCurso: false };
  }
  const texto = textoDelFalloDelRecalculo(nombresDe(e.fases), e.motivo);
  return o.puedePedir
    ? { texto, accion: ACCION_VOLVER_A_INTENTAR, secundaria: ACCION_APLICAR_DE_TODOS_MODOS, enCurso: false }
    : { texto: `${texto}${DESMARCALAS}`, accion: null, secundaria: null, enCurso: false };
}

/**
 * Lo que dice el grupo de tareas de UNA fase desfasada, después de su nombre. `desfasadas`: cuántas
 * fases desfasadas hay en la lista. Con una sola y la línea del recálculo a la vista (`r`), nada: la
 * línea ya lo dice, y dos veces con dos spinners es ruido (revisión de E2c).
 */
export function textoDelGrupoDesfasado(
  fase: string,
  r: RecalculoEnPantalla | null,
  desfasadas: number,
): { texto: string; enCurso: boolean } | null {
  if (r && desfasadas < 2) return null;
  if (r && r.fases.some((f) => f.id === fase)) {
    if (r.que === "esperando" || r.que === "armando") return { texto: "recalculando…", enCurso: true };
    if (r.que === "fallo") return { texto: "no se pudieron recalcular", enCurso: false };
  }
  if (r && r.despues.some((f) => f.id === fase)) return { texto: "sigue después", enCurso: false };
  return { texto: "falta recalcularlas", enCurso: false };
}

/**
 * La confirmación de «Aplicar de todos modos», un renglón por fase forzada: qué pasa con sus tareas,
 * armadas para otra forma. Con menos semanas, las que caían después van a la última (el servidor las
 * acota al escribir).
 */
export function textoDeAplicarDeTodosModos(forzadas: readonly FaseDesfasada[]): string[] {
  return forzadas.map((f) => {
    const nombre = nombresEnTexto([f.nombre]);
    return f.armada.semanas > f.forma.semanas
      ? `Las tareas de ${nombre} se armaron para ${plural(f.armada.semanas, "semana", "semanas")}: las que caían después pasan a la semana ${f.forma.semanas}.`
      : `Las tareas de ${nombre} se armaron para otra versión de la fase: revísalas después de aplicar.`;
  });
}
