/**
 * lib/contexto/cronograma-para-agentes.ts — EL TEXTO DEL CRONOGRAMA QUE LEEN LOS AGENTES (puro).
 *
 * El encabezado y un renglón por fase (y, con avance, uno por tarea). Es el formato que armaba el
 * bucle de `loadTimelineContext` (lib/canvas/load-canvas-context.ts), COPIADO BYTE A BYTE: lo fija
 * el golden de cronograma-para-agentes.test.ts, escrito y corrido contra el código de antes de la
 * extracción. `loadTimelineContext` lo usa con las fases de la base y suma después las desviaciones
 * ya registradas (solo las lee el avance).
 *
 * Existe aparte para que el paso 2 de «Regenerar todo» (E2a) pueda leer la estructura SUPUESTA del
 * borrador —las fases que la propuesta suma, con su clave `n:…`— con EXACTAMENTE el mismo texto que
 * lee hoy sobre el cronograma real (`cargarContextoDelDetalle` con `sobre`, lib/contexto/cargar.ts).
 *
 * ⚠ El encabezado conserva su redacción de siempre, con voseo («usá»): cambiarla es un cambio de
 * prompt de todos los agentes que leen el cronograma, y va en su propia tanda con el golden. Por eso
 * este archivo no está en detalle-cronograma.ts (que tiene la guarda de tuteo).
 */
import type { FotoDelCronograma } from "./material-cronograma";
import type { EstructuraHipotetica } from "@/lib/timeline/borrador";
import type { EstadoDelHito } from "@/lib/timeline/hitos";

/** Una fase tal como la lee un agente. `status` y `tasks` solo se escriben con avance. */
export interface FaseParaAgentes {
  id: string;
  name: string;
  durationWeeks: number;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  status?: string;
  tasks?: Array<{ id: string; title: string; status: string; weekIndex: number }>;
}

/**
 * La estructura SUPUESTA que lee el paso 2 de «Regenerar todo»: las fases del borrador para el
 * texto, la foto del plan para ubicar las reuniones en el calendario (el material) y la estructura
 * hipotética entera, que la fusión usa tal cual la vio el agente (no la de minutos después).
 */
export interface EstructuraSupuesta {
  fases: FaseParaAgentes[];
  foto: FotoDelCronograma;
  /**
   * Revisión de M1–M5 (2026-09-27, hallazgo 11): la foto con que se UBICAN las reuniones, si no es `foto`: el plan sin lo
   * que el sistema reprogramó desde hoy (el vigente cuando ocurrieron). Con `foto`, una reunión de la S6 sobre Service
   * Hub se leía en «Sales Hub», estirada hasta hoy: lo que ya pasó se reescribía en lo que lee la IA. El calendario sigue
   * sobre `foto` (la estructura que se propone). Ausente: se ubica con `foto`, como siempre.
   */
  fotoParaUbicar?: FotoDelCronograma;
  estructura: EstructuraHipotetica;
  /**
   * El alcance del prompt: las fases que se piden (ausente = todas). Sale SIEMPRE del borrador
   * guardado: `soloFase` («Regenerar» de una fase, E2b) o las fases del recálculo (E2c).
   */
  soloFases?: string[];
  /**
   * L5: lo que ya hay en cada fase, para que el agente de tareas no reescriba por reescribir: qué fases
   * están terminadas o en curso, qué se hizo, qué está pendiente y lo que notó el paso 1. Lo arma
   * `estructuraParaElDetalle` y lo escribe `renderLoQueYaHay` (lib/contexto/detalle-cronograma.ts).
   */
  loQueYaHay?: LoQueYaHay;
}

/** M2: un hito que ya está, con su estado (el del guardián, lib/timeline/hitos.ts). */
export interface TituloConEstado {
  titulo: string;
  estado: EstadoDelHito;
}

/** L5 (§6.3): lo que ya hay en el cronograma, como lo lee el agente de tareas. */
export interface LoQueYaHay {
  fases: Array<{
    id: string;
    nombre: string;
    estado: "terminada" | "en curso" | "pendiente" | "nueva";
    /** Los títulos de lo hecho (hasta 15 por fase, cada uno hasta 80 caracteres). */
    hechas: string[];
    /** Lo pendiente de la IA (PENDING y no escrito a mano), hasta 30 por fase. `semana` es el `weekIndex`
     *  (desde 0, relativo a la fase): el mismo número que el agente devuelve, así «repite su semana» no
     *  se corre en uno. */
    pendientes: Array<{ titulo: string; semana: number }>;
    /**
     * M2 (2026-09-27): lo que SE QUEDA aunque la IA no lo repita y no es ni hecho ni pendiente de la IA: en curso,
     * suspendido y pendiente escrito a mano, con su porqué («en curso», «suspendida», «a mano»; M3 suma «quedó sin
     * hacer», lo pendiente de una semana que ya pasó, que deja de estar en `pendientes`; M4 suma el suyo). Hasta 15, cada
     * título de hasta 80 caracteres. Sin esto el modelo no lo veía y lo volvía a proponer con
     * otras palabras. Opcional: los L5 de antes no lo traen (el texto sale igual).
     */
    seQuedan?: Array<{ titulo: string; porque: string }>;
    /** M2: cuántas hechas no entraron en `hechas` (había más de 15). Solo si hay alguna. */
    hechasDeMas?: number;
  }>;
  /** Las del borrador al pedir el paso 2 (trae lo que notó el paso 1). */
  observaciones: string[];
  /** Los ids de las fases terminadas que no se tocan (R12 activo). */
  terminadasQueNoSeTocan: string[];
  /** «Regenerar» de una fase o el recálculo: ahí «lo que ya se hizo va como tarea» manda (D11). */
  conAlcance: boolean;
  /**
   * M2 (2026-09-27): los hitos que YA tiene el proyecto (sus guardianes, `hitosDelProyecto`), para el bloque «HITOS DEL
   * PROYECTO». `entrega` trae una por ciclo en un recurrente. `faltaKickoff`: la misma condición con que el sistema lo
   * agregaría (R15: con Semana 0, en el alcance y sin empezar). Opcional como `seQuedan`; `estructuraParaElDetalle` lo
   * trae siempre.
   */
  hitos?: {
    kickoff: TituloConEstado[];
    cierre: TituloConEstado[];
    entrega: TituloConEstado[];
    recurrente: boolean;
    faltaKickoff: boolean;
  };
  /**
   * M3 (2026-09-27): LO QUE YA PASÓ, para el bloque «LO QUE YA PASÓ». Solo en «Regenerar todo» con el reloj de la
   * propuesta (`Borrador.hoy`) y sin alcance, y solo si alguna fase tiene semanas vencidas. `semanaDeHoy` desde 0 (la
   * del proyecto); por fase, desde qué `weekIndex` (relativo a la fase) se puede proponer, y si pasó entera. Las mismas
   * fases que R13 (con alguna tarea viva). Opcional: sin él, el texto sale igual que antes.
   */
  pasado?: {
    semanaDeHoy: number;
    porFase: Array<{ id: string; desde: number; entera: boolean }>;
  };
}

/** El encabezado y los renglones de fase (y de tarea, con avance). `includeProgress` implica ids. */
export function renderCronogramaParaAgentes(
  fases: readonly FaseParaAgentes[],
  opts: { includeIds?: boolean; includeProgress?: boolean } = {},
): string[] {
  const withProgress = !!opts.includeProgress;
  const withIds = withProgress || !!opts.includeIds; // progress implica ids
  const header = withProgress
    ? "CRONOGRAMA CON AVANCE CONFIRMADO (fases y tareas con su id y estado — usá esos ids EXACTOS para proponer avance; NO re-propongas lo que ya está DONE):"
    : withIds
    ? "CRONOGRAMA (fases en orden, cada una con su id — usá esos ids EXACTOS en tu output):"
    : "CRONOGRAMA (fases en orden — contexto de solo lectura, NO lo reproduzcas como lista en tu output):";
  const lines: string[] = [header];
  fases.forEach((p, i) => {
    const bits = [`${i + 1}. ${p.name}`];
    if (p.durationWeeks) bits.push(`${p.durationWeeks} sem`);
    if (p.sessionCount) bits.push(`${p.sessionCount} sesiones`);
    if (withIds) bits.push(`tipo: ${p.activityType ?? "(sin asignar)"}`);
    if (withProgress) bits.push(`estado: ${p.status}`);
    let line = bits.join(" · ");
    if (withIds) line = `[id: ${p.id}] ${line}`;
    if (p.notes?.trim()) line += ` — ${p.notes.trim()}`;
    lines.push(line);
    if (withProgress) {
      for (const t of p.tasks ?? []) {
        lines.push(`   - [tarea id: ${t.id}] (sem ${t.weekIndex + 1}, ${t.status}) ${t.title}`);
      }
    }
  });
  return lines;
}
