/**
 * lib/timeline/politica-de-atrasos.ts — ⭐ EL INTERRUPTOR de lo atrasado en «Regenerar todo» (M3, 2026-09-27).
 *
 * Puro y client-safe. Elías, 2026-09-27: «la práctica nos lo dirá». Para volver: cambia el valor y despliega con
 * `bash scripts/deploy.sh` (sin SQL ni re-siembra). Ver docs/DECISIONS.md.
 *
 * ── QUIÉN LO LEE (D11) ───────────────────────────────────────────────────────
 * `POLITICA_DE_ATRASOS` lo lee UN solo lugar del servidor: `marcarTareasEnCurso` (borrador-del-detalle.ts), que copia
 * la foto en `Borrador.hoy.politica` al marcar el paso 2. Todo lo demás (la regla, el mensaje, la pantalla) sale de
 * `hoy.politica`, nunca de la constante: si se voltea el valor, las propuestas abiertas siguen diciendo lo que
 * calcularon y la siguiente regeneración ya sale con la política nueva.
 *
 * ── LAS DOS DECISIONES ───────────────────────────────────────────────────────
 *  (b) `fasesVencidas`: una fase con la ventana cerrada que sigue abierta. «en-el-orden-del-plan» (lo decidido por
 *      Elías el 27-09): lo que no empezó espera a lo que le falta a lo que iba antes; «todo-desde-hoy»: todo arranca
 *      esta semana (implementado, apagado); «avisar»: no se reprograma, se nombra. Lo calcula M4.
 *  (a) `pendientesDelPasado`: lo pendiente de semanas que ya pasaron en la Semana 0 o en una fase en curso. «avisar»
 *      (lo vigente, decisión (a) de Elías): la propuesta no lo mueve y lo nombra (M3). «traer-a-hoy» (M5, implementado y
 *      APAGADO): en una fase en curso, cada abierta movible de una semana vencida pasa a la semana de hoy, con su casilla;
 *      la Semana 0 sigue en «avisar» siempre (D1).
 *  `casiTerminada` (D1): una fase empezada con esas abiertas o menos y esa parte hecha o más no se estira: se avisa.
 *
 * ── M5 (2026-09-27): LA POLÍTICA SE DECIDE SOLO ACÁ ──────────────────────────
 * Los nombres de las opciones («en-el-orden-del-plan», «todo-desde-hoy», «traer-a-hoy») se escriben SOLO en este
 * módulo. Quien necesita saber qué opción trae una propuesta pregunta con los predicados de abajo (`esperaAlPlan`,
 * `traeLoPendienteAHoy`…) y quien elige un texto por opción arma su tabla con `porCadaFasesVencidas` /
 * `porCadaPendientesDelPasado`, que lo obliga a cubrir TODAS las opciones. Guarda: politica-de-atrasos.test.ts (escanea
 * el repo sin tests).
 */

export type PoliticaDeFasesVencidas = "en-el-orden-del-plan" | "todo-desde-hoy" | "avisar";
/** M5 (2026-09-27): «traer-a-hoy» implementado; lo vigente sigue siendo «avisar». */
export type PoliticaDePendientesDelPasado = "avisar" | "traer-a-hoy";

export interface PoliticaDeAtrasos {
  fasesVencidas: PoliticaDeFasesVencidas;
  pendientesDelPasado: PoliticaDePendientesDelPasado;
  /** D1: el umbral de «casi terminada» (el valor por defecto se puede vetar). */
  casiTerminada: { maxAbiertas: number; minHecho: number };
}

/** ⭐ EL INTERRUPTOR. Para volver: cambia el valor y despliega. Ver docs/DECISIONS.md. */
export const POLITICA_DE_ATRASOS: PoliticaDeAtrasos = {
  fasesVencidas: "en-el-orden-del-plan",
  pendientesDelPasado: "avisar",
  casiTerminada: { maxAbiertas: 2, minHecho: 0.7 },
};

const FASES_VENCIDAS: readonly PoliticaDeFasesVencidas[] = ["en-el-orden-del-plan", "todo-desde-hoy", "avisar"];
const PENDIENTES_DEL_PASADO: readonly PoliticaDePendientesDelPasado[] = ["avisar", "traer-a-hoy"];

// ─────────────────────────────────────────────────────────────────────────────
// ── QUÉ OPCIÓN TRAE UNA PROPUESTA (M5: los predicados, los únicos que comparan) ─
// ─────────────────────────────────────────────────────────────────────────────

type ConFasesVencidas = Pick<PoliticaDeAtrasos, "fasesVencidas">;
type ConPendientesDelPasado = Pick<PoliticaDeAtrasos, "pendientesDelPasado">;

/** (b) En el orden del plan: lo que no empezó espera a lo que le falta a lo que iba antes. */
export const esperaAlPlan = (p: ConFasesVencidas): boolean => p.fasesVencidas === "en-el-orden-del-plan";
/** (b) Todo desde hoy: lo atrasado arranca esta semana (y el cierre nace desmarcado, D5). */
export const arrancaTodoHoy = (p: ConFasesVencidas): boolean => p.fasesVencidas === "todo-desde-hoy";
/** (b) Avisar: las fases vencidas no se reprograman, se nombran. */
export const soloAvisaLasFasesVencidas = (p: ConFasesVencidas): boolean => p.fasesVencidas === "avisar";
/** (a) Traer a hoy (M5): lo pendiente de semanas vencidas de una fase en curso pasa a la semana de hoy. */
export const traeLoPendienteAHoy = (p: ConPendientesDelPasado): boolean => p.pendientesDelPasado === "traer-a-hoy";

/**
 * La opción de (b) con que se escriben los textos de una propuesta: la que guardó su reloj; sin reloj (no se reprogramó
 * nada: «Regenerar» de una fase, «primera», un borrador de antes), la de por defecto de los textos. NUNCA la constante.
 */
export function fasesVencidasDeLosTextos(p: ConFasesVencidas | null | undefined): PoliticaDeFasesVencidas {
  return p?.fasesVencidas ?? "en-el-orden-del-plan";
}

/** Una cosa por cada opción de (b), con nombres de código: el compilador exige las tres. */
export interface PorCadaFasesVencidas<T> {
  enElOrdenDelPlan: T;
  todoDesdeHoy: T;
  avisar: T;
}
/** La tabla por opción de (b), indexable con lo guardado (`hoy.politica.fasesVencidas`). */
export function porCadaFasesVencidas<T>(o: PorCadaFasesVencidas<T>): Record<PoliticaDeFasesVencidas, T> {
  return { "en-el-orden-del-plan": o.enElOrdenDelPlan, "todo-desde-hoy": o.todoDesdeHoy, avisar: o.avisar };
}

/** Una cosa por cada opción de (a), con nombres de código: el compilador exige las dos. */
export interface PorCadaPendientesDelPasado<T> {
  avisar: T;
  traerAHoy: T;
}
/** La tabla por opción de (a), indexable con lo guardado (`hoy.politica.pendientesDelPasado`). */
export function porCadaPendientesDelPasado<T>(o: PorCadaPendientesDelPasado<T>): Record<PoliticaDePendientesDelPasado, T> {
  return { avisar: o.avisar, "traer-a-hoy": o.traerAHoy };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LO GUARDADO ──────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * La política GUARDADA en `Borrador.hoy.politica`, validada. null = mal formada o de una versión que esta no conoce
 * (un valor que todavía no existe): quien la lee trata la propuesta como si no trajera `hoy`, que es lo de siempre.
 * M5: una versión de antes de M5 no conoce «traer-a-hoy» y trata esa propuesta así (sin reloj): nada se rompe.
 */
export function leerPolitica(json: unknown): PoliticaDeAtrasos | null {
  if (!esObjeto(json)) return null;
  const { fasesVencidas, pendientesDelPasado, casiTerminada } = json;
  if (!FASES_VENCIDAS.includes(fasesVencidas as PoliticaDeFasesVencidas)) return null;
  if (!PENDIENTES_DEL_PASADO.includes(pendientesDelPasado as PoliticaDePendientesDelPasado)) return null;
  if (!esObjeto(casiTerminada)) return null;
  const { maxAbiertas, minHecho } = casiTerminada;
  if (typeof maxAbiertas !== "number" || !Number.isInteger(maxAbiertas) || maxAbiertas < 0) return null;
  if (typeof minHecho !== "number" || !Number.isFinite(minHecho) || minHecho < 0 || minHecho > 1) return null;
  return {
    fasesVencidas: fasesVencidas as PoliticaDeFasesVencidas,
    pendientesDelPasado: pendientesDelPasado as PoliticaDePendientesDelPasado,
    casiTerminada: { maxAbiertas, minHecho },
  };
}
