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
  estructura: EstructuraHipotetica;
  /**
   * El alcance del prompt: las fases que se piden (ausente = todas). Sale SIEMPRE del borrador
   * guardado: `soloFase` («Regenerar» de una fase, E2b) o las fases del recálculo (E2c).
   */
  soloFases?: string[];
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
