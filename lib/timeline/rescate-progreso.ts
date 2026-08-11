/**
 * lib/timeline/rescate-progreso.ts
 *
 * QUE «PEDIR CAMBIO CON IA» NO PUEDA BORRAR TRABAJO HECHO POR OLVIDO DEL MODELO. Puro, sin
 * Prisma: la ruta arma los datos y esta función decide qué se repone.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * El assist es "reemplazo completo": `tasks` siempre viaja definido, así que el PUT borra por
 * OMISIÓN todo lo que la propuesta no incluya. Basta con que el modelo se olvide de una tarea
 * DONE para perderla, sin aviso y sin forma de recuperarla. La protección `isKept` vivía solo en
 * el modal de curación (otro camino distinto), no acá.
 *
 * ── LAS TRES TRAMPAS, TODAS ENCONTRADAS EN AUDITORÍA (2026-08-11) ────────────
 * 1. MOVER NO ES BORRAR. Cuando el modelo mueve una tarea a otra fase, el saneador de la ruta le
 *    quita el `id` a propósito (el PUT no sabe mover: hace delete+create). Un rescate que mirara
 *    solo la fase ORIGEN no la encontraría y la repondría allá: quedaría la vieja DONE en origen
 *    MÁS un clon PENDING en destino, y el avance la contaría como logro y como deuda a la vez.
 *    Por eso "lo que la propuesta ya contempla" se arma con TODA la propuesta.
 * 2. Solo cuentan como movida las tareas propuestas SIN id. Una tarea que se queda en su lugar
 *    conserva el suyo; mirar todos los títulos haría que dos tareas legítimamente homónimas en
 *    fases distintas se taparan entre sí — y la que se pierde es justo la que tiene el progreso.
 * 3. La semana repuesta tiene que caber en la fase donde aterriza. Si el modelo acortó la fase,
 *    reponer con el `weekIndex` original produce una propuesta que el PUT RECHAZA con un 400
 *    ilegible (`weekIndex debe ser entero en [0, durationWeeks)`), imposible de arreglar desde la
 *    pantalla. Se recorta a la última semana válida.
 *
 * Y una fase que la propuesta sacó entera vuelve EN SU LUGAR (por su `order` original), no al
 * final: empujarla al final movía una fase contigua del medio a después de la última, corriendo
 * el cierre proyectado del proyecto sin que nadie lo pidiera.
 *
 * La huella de título es `fingerprintFromTitle`, la misma que define identidad de título en
 * [tarea-repetida.ts]. El criterio de "esto no se toca" es `isKept`, el mismo del apply curado:
 * una sola definición, en lib/timeline/regen-columnas.ts.
 */
import { isKept } from "./regen-columnas";
import { fingerprintFromTitle } from "./particularidad-identity";
import type { PutBody, PhaseInput } from "./validate";

export interface TareaRealParaRescate {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  status: string;
  source?: string | null;
}

export interface FaseRealParaRescate {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  tasks: TareaRealParaRescate[];
}

/** Recorta la semana a la última válida de la fase donde aterriza (trampa 3). */
function reponer(t: TareaRealParaRescate, durationWeeks: number) {
  return {
    id: t.id,
    title: t.title,
    weekIndex: Math.min(t.weekIndex, Math.max(durationWeeks - 1, 0)),
    order: t.order,
    notes: t.notes,
  };
}

/**
 * Devuelve las fases de la propuesta con lo protegido repuesto, y los avisos para la pantalla.
 * Se avisa SIEMPRE: la propuesta que el CSE ve tiene que coincidir con lo que se va a aplicar.
 *
 * No muta `fases` de entrada: devuelve un array nuevo con fases nuevas.
 */
export function rescatarProgreso(
  reales: readonly FaseRealParaRescate[],
  propuestas: readonly PhaseInput[],
): { phases: PutBody["phases"]; warnings: string[] } {
  const warnings: string[] = [];

  // Copia superficial + tasks propio, para no mutar lo que nos pasaron.
  const salida: PhaseInput[] = propuestas.map((p) => ({ ...p, tasks: [...(p.tasks ?? [])] }));
  const porId = new Map<string, PhaseInput>();
  for (const p of salida) if (p.id) porId.set(p.id, p);

  // Lo que la propuesta YA contempla — por id, y por huella SOLO de las que perdieron el id.
  const ids = new Set<string>();
  const huellasSinId = new Set<string>();
  for (const p of salida) {
    for (const t of p.tasks ?? []) {
      if (t.id) ids.add(t.id);
      else {
        const h = fingerprintFromTitle(t.title);
        if (h) huellasSinId.add(h);
      }
    }
  }
  const yaContemplada = (t: TareaRealParaRescate) =>
    ids.has(t.id) || huellasSinId.has(fingerprintFromTitle(t.title));

  const fasesRescatadas: PhaseInput[] = [];

  for (const real of reales) {
    const rescatadas = real.tasks.filter(isKept).filter((t) => !yaContemplada(t));
    if (rescatadas.length === 0) continue;
    const propuesta = real.id ? porId.get(real.id) : undefined;

    if (!propuesta) {
      /* La IA sacó la fase entera. El PUT la borraría con sus tareas por cascade, así que vuelve
         — SOLO con lo que tiene progreso. Mismo criterio aditivo que rige la reconciliación del
         handoff: una fase con trabajo real no se borra sin que lo pida una persona (para eso está
         el gesto de borrar fase, que exige `deleteTimeline`). */
      fasesRescatadas.push({
        id: real.id,
        name: real.name,
        order: real.order,
        durationWeeks: real.durationWeeks,
        startWeek: real.startWeek,
        sessionCount: real.sessionCount,
        notes: real.notes,
        activityType: real.activityType as PhaseInput["activityType"],
        tasks: rescatadas.map((t) => reponer(t, real.durationWeeks)),
      });
      warnings.push(
        `La fase "${real.name}" tiene ${rescatadas.length} tarea(s) con progreso: se conserva en vez de borrarse.`,
      );
      continue;
    }

    const dur = propuesta.durationWeeks ?? real.durationWeeks;
    propuesta.tasks = [...(propuesta.tasks ?? []), ...rescatadas.map((t) => reponer(t, dur))];
    warnings.push(
      `En "${real.name}" se conservaron ${rescatadas.length} tarea(s) con progreso que la propuesta no incluía.`,
    );
  }

  if (fasesRescatadas.length === 0) return { phases: salida, warnings };

  /* ⚠ La posición se resuelve contra el orden ORIGINAL, no contra el de la propuesta. El modelo
     renumera denso lo que devuelve (sacó la fase 1 de 3 → las suyas quedan 0 y 1), así que
     comparar el `order` de la fase rescatada (1) contra ésos la manda al final igual — el bug
     que este arreglo venía a evitar. Cada fase propuesta se ancla al orden que esa fase tenía
     ANTES; las fases nuevas (sin id) se quedan pegadas a la anterior con un desempate mínimo,
     que es donde el modelo las puso. */
  const ordenOriginal = new Map(reales.map((r) => [r.id, r.order]));
  let ancla = -1;
  let desempate = 0;
  const anclaje = new Map<PhaseInput, number>();
  for (const p of salida) {
    const conocido = p.id ? ordenOriginal.get(p.id) : undefined;
    if (conocido !== undefined) {
      ancla = conocido;
      desempate = 0;
    } else {
      desempate += 1;
    }
    anclaje.set(p, ancla + desempate / 1000);
  }
  for (const p of fasesRescatadas) anclaje.set(p, p.order);

  const phases = [...salida, ...fasesRescatadas].sort(
    (a, b) => (anclaje.get(a) ?? 0) - (anclaje.get(b) ?? 0),
  );
  phases.forEach((p, i) => {
    p.order = i;
  });
  return { phases, warnings };
}
