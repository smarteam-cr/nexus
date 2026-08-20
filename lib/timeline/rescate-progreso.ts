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

/**
 * POR QUÉ se rescató, en castellano y sin mentir.
 *
 * ⛔ El mensaje decía siempre «tarea(s) con progreso», y era FALSO la mitad de las veces: `isKept`
 * conserva por DOS motivos distintos —tener progreso (status ≠ PENDING) o estar escrita a mano
 * (source HUMAN)— y una tarea pendiente que el CSE tipeó él mismo cae por el segundo.
 *
 * Elías lo cazó el 2026-08-20: pidió borrar una fase, el sistema le dijo que tenía «2 tareas con
 * progreso», y las dos estaban pendientes. Con el motivo equivocado no se puede decidir: «tiene
 * progreso» suena a «no lo toques» y «la escribiste vos» suena a «vos sabrás».
 */
function porQueSeRescataron(tareas: readonly TareaRealParaRescate[]): string {
  const conProgreso = tareas.filter((t) => (t.status ?? "PENDING") !== "PENDING").length;
  const aMano = tareas.length - conProgreso;
  const partes: string[] = [];
  if (conProgreso > 0) partes.push(`${conProgreso} con progreso`);
  if (aMano > 0) partes.push(`${aMano} escrita${aMano === 1 ? "" : "s"} a mano`);
  return partes.join(" y ");
}
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
 * Las huellas de título que llegan SIN id en TODO el body — o sea, las tareas que se están
 * MOVIENDO de fase (el saneador les quita el id porque el PUT no sabe mover: hace delete+create).
 *
 * Se calcula sobre el body entero y no fase por fase: la tarea sale de una fase y entra en otra,
 * así que mirar solo la fase de origen no la encontraría. Es la trampa 1 del docblock de arriba,
 * vista desde el lado del que borra.
 */
export function huellasEnMovimiento(phases: readonly PhaseInput[]): Set<string> {
  const huellas = new Set<string>();
  for (const p of phases) {
    for (const t of p.tasks ?? []) {
      if (t.id) continue;
      const h = fingerprintFromTitle(t.title);
      if (h) huellas.add(h);
    }
  }
  return huellas;
}

/**
 * ⭐ QUÉ SE PUEDE BORRAR POR OMISIÓN. La regla que hace que la protección sea propiedad del
 * CAMINO DE ESCRITURA y no de un llamador.
 *
 * ── POR QUÉ ESTA FUNCIÓN EXISTE (2026-08-18) ─────────────────────────────────
 * `rescatarProgreso` (abajo) protegía de verdad, pero tenía UN solo call site: la ruta del assist.
 * El `PUT /timeline` —que es quien realmente escribe— borraba por omisión sin mirar `status` ni
 * `source`, así que la promesa "no se pierde trabajo hecho" era cierta para UN camino, no para el
 * dato. Cualquier llamador nuevo del PUT (el asistente que viene, un script, un payload viejo de
 * una pestaña que quedó abierta) la reabría entera. Es el mismo defecto que ya se corrigió una vez
 * en `apply-curated-phase.ts`, donde la protección vivía solo en el cliente.
 *
 * ── LA EXCEPCIÓN, Y POR QUÉ NO ES OPCIONAL ───────────────────────────────────
 * ⚠ Una tarea protegida SÍ se borra si su título viaja sin id en el body: eso no es un olvido, es
 * un MOVIMIENTO, y el PUT lo implementa como borrar-en-origen + crear-en-destino. Sin esta
 * excepción, mover una tarea DONE dejaría la vieja en origen MÁS el clon nuevo en destino, y el
 * avance la contaría como logro y como deuda a la vez.
 *
 * ⚠ ALCANCE: esto cubre el borrado de TAREAS por omisión. Que la propuesta saque una FASE entera
 * (y se lleve sus tareas por cascade) lo sigue cubriendo solo `rescatarProgreso`, en el camino del
 * assist — la UI no le ofrece borrar fases al CSE y el nuke completo es otro endpoint con su
 * propio permiso.
 */
/** Lo MÍNIMO para decidir si una tarea se puede borrar. Menos que `TareaRealParaRescate` a
 *  propósito: el PUT no tiene por qué cargar `weekIndex`/`order`/`notes` para poder proteger. */
export interface TareaProtegible {
  id: string;
  title: string;
  status: string;
  source?: string | null;
}

export function idsBorrablesPorOmision(
  existentes: readonly TareaProtegible[],
  idsQueLlegan: ReadonlySet<string>,
  enMovimiento: ReadonlySet<string>,
): string[] {
  return existentes
    .filter((t) => !idsQueLlegan.has(t.id))
    .filter((t) => !isKept(t) || enMovimiento.has(fingerprintFromTitle(t.title)))
    .map((t) => t.id);
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
        `La fase "${real.name}" no se borró: tiene ${rescatadas.length} tarea(s) (${porQueSeRescataron(rescatadas)}). Para borrarla, primero movelas o borralas a mano.`,
      );
      continue;
    }

    const dur = propuesta.durationWeeks ?? real.durationWeeks;
    propuesta.tasks = [...(propuesta.tasks ?? []), ...rescatadas.map((t) => reponer(t, dur))];
    warnings.push(
      `En "${real.name}" se conservaron ${rescatadas.length} tarea(s) que la propuesta no incluía (${porQueSeRescataron(rescatadas)}).`,
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
