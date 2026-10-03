/**
 * lib/timeline/referencias-de-la-propuesta.ts — CONTRA QUÉ SE COMPARA LA PROPUESTA (L4, 2026-09-26). Puro y client-safe.
 *
 * El mensaje de arriba del Gantt (lib/timeline/mensaje-de-la-propuesta.ts) dice cómo queda el cierre contra dos cosas
 * que NO están en el borrador, y de qué material salió la propuesta:
 *   · LO PROMETIDO (D5): lo último que se subió al cliente, `ProjectTimeline.publishedSnapshot`, con la fecha de
 *     `Project.timelinePublishedAt`. No la baseline: el cliente ve la foto que se congela al «Subir».
 *   · EL ÚLTIMO HANDOFF (D6), aproximado: las fases de la salida (`AgentRun.output`) de su última corrida DONE. Solo con
 *     una propuesta que no es del handoff, y siempre dice «aprox.».
 *   · LAS FUENTES: qué reuniones y notas tenían las corridas de la propuesta, y si hay instrucciones adicionales.
 *
 * Acá vive lo puro: los tipos que viajan en el GET, la validación del snapshot (`fasesPublicadas`), la de la salida del
 * handoff (`fasesDelHandoff`, la MISMA que usa analyze/route.ts al guardar las fases del handoff: una sola regla) y la
 * caché acotada. La lectura de la base vive aparte, en lib/timeline/leer-referencias.ts (server), como la autoría
 * (autoria-de-la-propuesta.ts + leer-autoria.ts): así la pantalla importa los tipos sin arrastrar Prisma.
 * ⛔ Nunca importa de `lib/google` (ni la raíz de `googleapis`).
 */
import { normalizePublishedTimeline } from "@/lib/external/snapshot-normalize";
import { projectedEnd, timelineSpan } from "./weeks";

// ─────────────────────────────────────────────────────────────────────────────
// ── LO QUE VIAJA EN EL GET ───────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo último que se subió al cliente: su cierre (YYYY-MM-DD, null sin fecha de arranque), sus semanas y cuándo se
 *  subió (ISO, null si no se sabe). */
export interface PrometidoDeLaPropuesta {
  cierreISO: string | null;
  semanas: number;
  fecha: string | null;
}

/** El último handoff, APROXIMADO: sus semanas (no tiene fecha de arranque) y cuándo corrió (ISO). */
export interface HandoffDeLaPropuesta {
  semanas: number;
  fecha: string;
}

/** Con qué material se armó la propuesta: las reuniones de sus corridas, las notas que había y si hay instrucciones
 *  adicionales (aproximado: dice si las hay HOY). */
export interface FuentesDeLaPropuesta {
  instrucciones: boolean;
  reuniones: Array<{ titulo: string; fecha: string }>;
  notas: string[];
}

/** L4: contra qué se compara la propuesta abierta (solo con un borrador-v1 guardado; si no, el GET manda null). */
export interface ReferenciasDeLaPropuesta {
  prometido: PrometidoDeLaPropuesta | null;
  handoff: HandoffDeLaPropuesta | null;
  fuentes: FuentesDeLaPropuesta | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO PROMETIDO ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fase de lo que se subió, con lo que hace falta para el calendario. */
export interface FasePublicada {
  durationWeeks: number;
  startWeek: number | null;
}

const enteroDesde = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

/**
 * Las fases de lo que se subió, VALIDADAS, en su orden: `null` si no hay fases o si alguna no tiene una duración entera
 * ≥ 1 o un inicio entero ≥ 0 (o vacío). Un snapshot a medias no se compara: una semana de menos diría «a tiempo» sin
 * serlo. Ordena por `order` si TODAS lo traen; si no, el orden del arreglo (el de la foto).
 */
export function fasesPublicadas(snap: { exists?: boolean; phases: ReadonlyArray<Record<string, unknown>> } | null): FasePublicada[] | null {
  if (!snap || snap.exists === false || snap.phases.length === 0) return null;
  const fases: Array<FasePublicada & { order: number | null }> = [];
  for (const p of snap.phases) {
    const inicio = p.startWeek ?? null;
    if (!enteroDesde(p.durationWeeks, 1)) return null;
    if (inicio !== null && !enteroDesde(inicio, 0)) return null;
    fases.push({ durationWeeks: p.durationWeeks, startWeek: inicio, order: typeof p.order === "number" ? p.order : null });
  }
  const ordenadas = fases.every((f) => f.order !== null) ? [...fases].sort((a, b) => a.order! - b.order!) : fases;
  return ordenadas.map(({ durationWeeks, startWeek }) => ({ durationWeeks, startWeek }));
}

/** Lo prometido: el snapshot congelado (con SU fecha de arranque: la que vio el cliente) y el día que se subió. */
export function prometidoDelSnapshot(snapshot: unknown, publicadoEn: Date | string | null): PrometidoDeLaPropuesta | null {
  const snap = normalizePublishedTimeline(snapshot);
  const fases = fasesPublicadas(snap);
  if (!fases) return null;
  const fin = projectedEnd(snap.anchorStartDate, fases);
  const fecha = publicadoEn === null ? null : typeof publicadoEn === "string" ? publicadoEn : publicadoEn.toISOString();
  return { cierreISO: fin.date ? fin.date.toISOString().slice(0, 10) : null, semanas: fin.spanWeeks, fecha };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL HANDOFF ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fase de la salida del handoff, como la guarda analyze/route.ts al crear el cronograma. */
export interface FaseDelHandoff {
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  needsValidation: boolean;
  source: "AGENT";
}

/**
 * Las fases VÁLIDAS de la salida del handoff (`{ timeline: { phases } }`, ya parseada): nombre no vacío y duración > 0;
 * el inicio, las sesiones y la nota solo si sirven. ⭐ Es LA regla de analyze/route.ts (se extrajo de ahí, que la usa
 * al guardar las fases del handoff): la comparación del mensaje mira las mismas fases que el cronograma habría creado.
 * Sin salida, sin `timeline.phases` o sin ninguna válida: [].
 */
export function fasesDelHandoff(salida: unknown): FaseDelHandoff[] {
  return fasesCrudasValidas(salida)
    .map((p, i) => ({
      name: p.name.trim(),
      order: i,
      durationWeeks: Math.floor(p.durationWeeks),
      // startWeek: inicio explícito (paralelo) si el agente lo dio; null = contigua tras la anterior.
      startWeek: typeof p.startWeek === "number" && p.startWeek >= 0 ? Math.floor(p.startWeek) : null,
      sessionCount: typeof p.sessionCount === "number" && p.sessionCount > 0
        ? Math.floor(p.sessionCount)
        : null,
      notes: typeof p.notes === "string" && p.notes.trim().length > 0
        ? p.notes.trim()
        : null,
      // El agente marca "estimated" cuando no tuvo datos de tiempos en ventas → badge "estimada".
      needsValidation: p.estimated === true,
      source: "AGENT" as const,
    }));
}

type FaseCruda = { name: string; durationWeeks: number; sessionCount?: number; notes?: string; estimated?: boolean; startWeek?: number; tipo?: unknown };

/** Las fases crudas que pasan el filtro de `fasesDelHandoff`, en el mismo orden (una sola regla para las dos lecturas). */
function fasesCrudasValidas(salida: unknown): FaseCruda[] {
  const timelineRaw = (salida as { timeline?: { phases?: unknown } } | null)?.timeline?.phases;
  if (!Array.isArray(timelineRaw) || timelineRaw.length === 0) return [];
  return timelineRaw.filter((p: unknown): p is FaseCruda => {
    if (!p || typeof p !== "object") return false;
    const obj = p as Record<string, unknown>;
    return typeof obj.name === "string"
      && obj.name.trim().length > 0
      && typeof obj.durationWeeks === "number"
      && obj.durationWeeks > 0;
  });
}

/**
 * El `tipo` que la IA declaró para cada fase de `fasesDelHandoff` (mismo filtro, mismo orden), crudo:
 * lo interpreta lib/timeline/acomodar-en-paralelo.ts. Va aparte porque las fases se escriben tal cual
 * en `TimelinePhase`, que no tiene esa columna (2026-10-02).
 */
export function tiposDelHandoff(salida: unknown): unknown[] {
  return fasesCrudasValidas(salida).map((p) => p.tipo ?? null);
}

/** La salida GUARDADA de una corrida (`AgentRun.output`, un JSON en texto), o null si no se deja leer. */
export function leerSalidaGuardada(output: string | null | undefined): unknown {
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/** El handoff para el mensaje: sus semanas (el calendario de sus fases válidas) y cuándo corrió. null sin fases. */
export function handoffDeLaSalida(output: string | null | undefined, corrioEn: Date): HandoffDeLaPropuesta | null {
  const fases = fasesDelHandoff(leerSalidaGuardada(output));
  if (fases.length === 0) return null;
  return { semanas: timelineSpan(fases), fecha: corrioEn.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA CACHÉ ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántas propuestas recuerda la caché del handoff (una entrada por token). */
export const TOPE_DE_LA_CACHE = 50;
/**
 * Revisión de L1–L7 (#7): cuánto vive el handoff recordado de una propuesta. Sin esto, regenerar el handoff con una
 * propuesta abierta no cambiaba «Contra el último handoff» hasta reiniciar el proceso (el token de la propuesta no
 * cambia: `guardarPropuestaDelHandoff` no pisa una sin decidir).
 */
export const VIDA_DEL_HANDOFF_MS = 5 * 60_000;

export interface CacheAcotada<V> {
  has(clave: string): boolean;
  get(clave: string): V | undefined;
  set(clave: string, valor: V): void;
  readonly size: number;
}

/**
 * Un `Map` que no pasa de `tope` entradas: al llenarse expulsa la más vieja (la primera que entró). La lectura del
 * handoff es una fila de `AgentRun` sin índice por proyecto y con una salida de hasta ~150 KB: se lee una vez por
 * propuesta abierta, no en cada GET. Vive en el proceso web; reiniciar la vacía, y eso está bien.
 * Revisión de L1–L7 (#7): con `vidaMs`, una entrada más vieja que eso ya no está (`has` da false y se vuelve a leer).
 * `ahora` lo inyectan los tests.
 */
export function cacheAcotada<V>(
  tope: number = TOPE_DE_LA_CACHE,
  vidaMs: number | null = null,
  ahora: () => number = () => Date.now(),
): CacheAcotada<V> {
  const m = new Map<string, { valor: V; en: number }>();
  const viva = (clave: string): { valor: V } | null => {
    const e = m.get(clave);
    if (!e) return null;
    if (vidaMs !== null && ahora() - e.en >= vidaMs) {
      m.delete(clave);
      return null;
    }
    return e;
  };
  return {
    has: (clave) => viva(clave) !== null,
    get: (clave) => viva(clave)?.valor,
    set(clave, valor) {
      if (m.has(clave)) m.delete(clave);
      m.set(clave, { valor, en: ahora() });
      while (m.size > tope) {
        const vieja = m.keys().next();
        if (vieja.done) break;
        m.delete(vieja.value);
      }
    },
    get size() {
      return m.size;
    },
  };
}
