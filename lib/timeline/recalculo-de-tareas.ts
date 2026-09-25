/**
 * lib/timeline/recalculo-de-tareas.ts — EL RECÁLCULO DE LAS TAREAS DE UNA FASE DESFASADA (E2c), EN PANTALLA.
 *
 * Puro y client-safe. Si el CSE quita un cambio de fase (el de semanas de «Pruebas», por ejemplo), las
 * tareas de esa fase quedaron armadas para otra forma: la fase está DESFASADA (lib/timeline/borrador.ts,
 * `FaseDesfasada`) y sus tareas se recalculan solas, en UNA corrida para todas, tras una espera corta
 * desde la última casilla. Acá vive lo que decide la pantalla, para probarlo fuera del Canvas:
 *   · la espera (`trasLaMarca`, `alVencer`): cuándo arranca, cuándo se lanza y cuándo no;
 *   · qué se ve (`recalculoEnPantalla`) y los textos de la línea, del grupo y de «Aplicar de todos modos».
 * Importa de borrador.ts, nunca al revés.
 */
import {
  ACCION_VOLVER_A_INTENTAR,
  nombresEnTexto,
  textoDelFalloDelRecalculo,
  type FaseDesfasada,
  type RecalculoEnElCable,
} from "./borrador";
import { plural } from "./weeks";

/** La espera desde la última casilla antes de lanzar el recálculo: dos casillas seguidas pagan UNA corrida. */
export const ESPERA_DEL_RECALCULO_MS = 4000;
export const ACCION_RECALCULAR = "Recalcular las tareas";
export const ACCION_APLICAR_DE_TODOS_MODOS = "Aplicar de todos modos";

const normalizar = (s: string) => s.trim().toLowerCase();

/**
 * La identidad de lo que hay que recalcular: cada fase con la forma que va a tener. Si no cambia, no
 * hay nada nuevo que pedir. "" sin ninguna.
 */
export function claveDeDesfasadas(d: readonly FaseDesfasada[]): string {
  return d
    .map((f) => `${f.fase}:${normalizar(f.forma.nombre)}:${f.forma.semanas}:${f.forma.sesiones ?? ""}:${f.forma.semanaCero ? 1 : 0}`)
    .sort()
    .join("|");
}

/**
 * Tras una casilla del CSE: ¿arranca (o vuelve a empezar) la espera? Solo si puede pedir, hay algo que
 * recalcular y cambió lo que hay que recalcular (o ya estaba esperando: la espera cuenta desde la
 * última casilla).
 */
export function trasLaMarca(i: { antes: string; ahora: string; esperando: boolean; puedePedir: boolean }): boolean {
  return i.puedePedir && i.ahora !== "" && (i.ahora !== i.antes || i.esperando);
}

/**
 * Al vencer la espera. «nada»: sin permiso, sin nada que recalcular, o lo mismo que ya se lanzó (tras
 * un fallo no se relanza solo: la línea ofrece «Volver a intentar»). «esperar»: todavía no se puede
 * lanzar (otra corrida, aplicando, guardando…), se espera otra vez. «lanzar»: se pide.
 */
export function alVencer(i: {
  clave: string;
  ultimaLanzada: string | null;
  puedePedir: boolean;
  puedeLanzar: boolean;
}): "lanzar" | "esperar" | "nada" {
  if (!i.puedePedir || i.clave === "" || i.clave === i.ultimaLanzada) return "nada";
  if (!i.puedeLanzar) return "esperar";
  return "lanzar";
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

export interface RecalculoEnPantalla {
  que: "esperando" | "armando" | "fallo" | "pendiente";
  /** Las fases de las que habla la línea. */
  fases: Array<{ id: string; nombre: string }>;
  /** «armando»: las desfasadas que no entran en la corrida que corre (se lanzan al terminar). */
  despues: Array<{ id: string; nombre: string }>;
  /** La fase de la corrida («Leyendo las reuniones»), solo en «armando». */
  fase: string | null;
  /** Por qué falló, solo en «fallo». */
  motivo: string | null;
}

/**
 * Qué se ve del recálculo, en este orden (D son las desfasadas; S, las fases del recálculo guardado):
 *   1. el servidor recalcula y hay desfasadas → «armando», con las que entran (D ∩ S) y las que
 *      siguen después (D − S);
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
      despues: d.filter((f) => !s.has(f.id)),
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

/** Lo que dice el grupo de tareas de UNA fase desfasada, después de su nombre. */
export function textoDelGrupoDesfasado(fase: string, r: RecalculoEnPantalla | null): { texto: string; enCurso: boolean } {
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
