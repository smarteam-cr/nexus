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
 *  (a) `pendientesDelPasado`: lo pendiente de semanas que ya pasaron en la Semana 0 o en una fase en curso. «avisar»:
 *      la propuesta no lo mueve y lo nombra (M3). M5 suma «traer-a-hoy».
 *  `casiTerminada` (D1): una fase empezada con esas abiertas o menos y esa parte hecha o más no se estira: se avisa.
 */

export type PoliticaDeFasesVencidas = "en-el-orden-del-plan" | "todo-desde-hoy" | "avisar";
/** M5 suma «traer-a-hoy». */
export type PoliticaDePendientesDelPasado = "avisar";

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
const PENDIENTES_DEL_PASADO: readonly PoliticaDePendientesDelPasado[] = ["avisar"];

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * La política GUARDADA en `Borrador.hoy.politica`, validada. null = mal formada o de una versión que esta no conoce
 * (un valor que todavía no existe): quien la lee trata la propuesta como si no trajera `hoy`, que es lo de siempre.
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
