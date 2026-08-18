/**
 * lib/timeline/assist-items.ts — LA PROPUESTA DEL MODIFICADOR, RESUELTA POR ÍTEM.
 *
 * PURO (sin Prisma, sin fetch). Lo consume la vista previa del cronograma.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────────────────────
 * El modificador (`POST /timeline/assist`) devuelve un REEMPLAZO COMPLETO del cronograma. Hasta
 * hoy la vista previa era todo-o-nada: el CSE pedía «atrasá Setup una semana», el modelo de paso
 * reescribía tres títulos y movía una tarea, y la única salida era tragarse las cuatro cosas o
 * descartar las cuatro. Con 100 tareas eso es una apuesta, no una revisión.
 *
 * Acá el reemplazo se descompone en ÍTEMS con clave estable, y `proyectarAceptados` reconstruye
 * el payload del PUT conteniendo SOLO los ítems aceptados. No hay endpoint de escritura nuevo:
 * lo aceptado se aplica por el mismo PUT de siempre, con su rescate de progreso y su auditoría.
 *
 * ── LAS TRES REGLAS QUE SOSTIENEN QUE ESTO NO PIERDA TRABAJO ─────────────────────────────────
 *  1. ⛔ UNA FASE SIN NINGÚN ÍTEM DE TAREA ACEPTADO SALE **SIN** `tasks`. En el contrato del PUT
 *     `tasks: undefined` = «no tocar» y `tasks: []` = «borrar todas». Emitir el array siempre
 *     convertiría cada aplicación parcial en un diff completo de esa fase — y el PUT borra por
 *     omisión. Es el modo de falla más caro de todo el módulo y por eso tiene guarda propia.
 *  2. La proyección arranca de lo ACTUAL, no de la propuesta: un cambio que nadie aceptó no
 *     puede colarse por estar «al lado» de uno que sí.
 *  3. `weekIndex` se acota contra la duración EFECTIVA de la fase (la aceptada, no la propuesta):
 *     aceptar «mové la tarea a la semana 3» sin aceptar «la fase pasa a durar 4 semanas» produce
 *     un payload que el validador rechaza. Acotar es determinista; 422 es una pared.
 *
 * ── LO QUE NO ES UN ÍTEM, Y POR QUÉ ──────────────────────────────────────────────────────────
 * El ORDEN de las fases existentes no se resuelve fase por fase: reordenar es un solo hecho, y
 * aceptar «esta fase va tercera» sin las otras produce una secuencia que nadie pidió. Va como un
 * único ítem global (`orden-fases`).
 */

export type Party = "CLIENTE" | "SMARTEAM" | "AMBOS" | "DEV";
export type TipoDeTarea = "SESSION" | "TASK";

export interface TareaActual {
  id: string;
  title: string;
  weekIndex: number;
  /** Opcional: el canvas lo deriva de la posición del array, y la proyección lo reasigna igual. */
  order?: number;
  notes?: string | null;
  party?: Party | null;
  type?: TipoDeTarea | null;
  status?: string;
  source?: string;
}

export interface FaseActual {
  id: string;
  name: string;
  /** Opcional: el orden real es la posición en el array, y la proyección lo reasigna. */
  order?: number;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  tasks: TareaActual[];
}

export interface TareaPropuesta {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes?: string | null;
  party?: Party | null;
  type?: TipoDeTarea | null;
}

export interface FasePropuesta {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: string | null;
  tasks?: TareaPropuesta[];
}

export interface PropuestaDelAssist {
  anchorStartDate?: string | null;
  phases: FasePropuesta[];
}

export type ClaseDeItem =
  | "ancla"
  | "orden-fases"
  | "fase-nueva"
  | "fase-cambia"
  | "fase-se-va"
  | "tarea-nueva"
  | "tarea-cambia"
  | "tarea-se-va"
  | "tarea-se-muda";

export interface ItemDeAssist {
  /** Clave estable — es lo que el usuario acepta o descarta. */
  key: string;
  clase: ClaseDeItem;
  /** Qué cambia, en una línea corta. */
  titulo: string;
  /** El antes → después, ya redactado. Vacío cuando el título se basta. */
  detalle: string;
  /** Fase donde se ve el cambio, para agrupar la lista. */
  fase: string;
  /**
   * El ítem toca algo con trabajo humano encima (tarea DONE / IN_PROGRESS / SUSPENDED / HUMAN).
   * No lo bloquea —el rescate del PUT es quien decide— pero la lista lo tiene que gritar.
   */
  pesado: boolean;
}

/** Salida: exactamente el shape que acepta el PUT del cronograma (`PutBody`). */
export interface PayloadProyectado {
  anchorStartDate: string | null;
  phases: Array<{
    id?: string;
    name: string;
    order: number;
    durationWeeks: number;
    startWeek?: number | null;
    sessionCount?: number | null;
    notes?: string | null;
    activityType?: string | null;
    /** ⚠ undefined = «no tocar las tareas de esta fase». Ver la regla 1 del encabezado. */
    tasks?: Array<{
      id?: string;
      title: string;
      weekIndex: number;
      order: number;
      notes?: string | null;
      party?: Party | null;
      type?: TipoDeTarea | null;
    }>;
  }>;
}

const nn = <T,>(v: T | null | undefined): T | null => (v === undefined ? null : v);
const dia = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");

/** Título normalizado — es la llave con la que se reconoce una tarea MUDADA de fase. */
function huella(titulo: string): string {
  return titulo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Una tarea con progreso o escrita a mano: perderla cuesta trabajo real. */
function tieneTrabajoEncima(t: TareaActual): boolean {
  return (t.status ?? "PENDING") !== "PENDING" || t.source === "HUMAN";
}

/** La clave de fase que usan los ítems de tarea: el id real, o la posición si la fase es nueva. */
function claveDeFase(p: FasePropuesta, idx: number): string {
  return p.id ?? `n${idx}`;
}

function faseCambio(a: FaseActual, p: FasePropuesta): string[] {
  const cambios: string[] = [];
  if (a.name !== p.name) cambios.push(`«${a.name}» → «${p.name}»`);
  if (a.durationWeeks !== p.durationWeeks)
    cambios.push(`${a.durationWeeks} → ${p.durationWeeks} ${p.durationWeeks === 1 ? "semana" : "semanas"}`);
  if (nn(a.startWeek) !== nn(p.startWeek))
    cambios.push(`arranque relativo ${nn(a.startWeek) ?? "auto"} → ${nn(p.startWeek) ?? "auto"}`);
  if (nn(a.activityType) !== nn(p.activityType))
    cambios.push(`tipo ${nn(a.activityType) ?? "sin tipo"} → ${nn(p.activityType) ?? "sin tipo"}`);
  if (nn(a.sessionCount) !== nn(p.sessionCount))
    cambios.push(`sesiones ${nn(a.sessionCount) ?? "—"} → ${nn(p.sessionCount) ?? "—"}`);
  if (nn(a.notes) !== nn(p.notes)) cambios.push("nota de la fase");
  return cambios;
}

function tareaCambio(a: TareaActual, p: TareaPropuesta): string[] {
  const cambios: string[] = [];
  if (a.title !== p.title) cambios.push(`«${a.title}» → «${p.title}»`);
  if (a.weekIndex !== p.weekIndex) cambios.push(`semana ${a.weekIndex + 1} → ${p.weekIndex + 1}`);
  if (nn(a.notes) !== nn(p.notes)) cambios.push("nota");
  // `undefined` en la propuesta = «no tocar» (contrato del PUT): no es un cambio.
  if (p.party !== undefined && nn(a.party) !== nn(p.party))
    cambios.push(`dueño ${nn(a.party) ?? "sin dueño"} → ${nn(p.party) ?? "sin dueño"}`);
  if (p.type !== undefined && nn(a.type) !== nn(p.type))
    cambios.push(`tipo ${nn(a.type) ?? "sin tipo"} → ${nn(p.type) ?? "sin tipo"}`);
  return cambios;
}

/** Índice interno que comparten el diff y la proyección — así no pueden discrepar. */
interface Mapa {
  faseActualPorId: Map<string, FaseActual>;
  tareaActualPorId: Map<string, TareaActual>;
  faseDeTarea: Map<string, string>;
  /** taskId (existente que se va) → { claveFaseDestino, tarea } cuando en realidad se MUDÓ. */
  mudanzas: Map<string, { claveFaseDestino: string; tarea: TareaPropuesta }>;
  /** claves `${claveFase}:${idx}` de tareas sin id que son el destino de una mudanza. */
  destinosDeMudanza: Set<string>;
  idsPropuestos: Set<string>;
  idsDeFasePropuestos: Set<string>;
}

function indexar(actuales: FaseActual[], propuesta: PropuestaDelAssist): Mapa {
  const faseActualPorId = new Map(actuales.map((p) => [p.id, p]));
  const tareaActualPorId = new Map<string, TareaActual>();
  const faseDeTarea = new Map<string, string>();
  for (const p of actuales) {
    for (const t of p.tasks) {
      tareaActualPorId.set(t.id, t);
      faseDeTarea.set(t.id, p.id);
    }
  }

  const idsPropuestos = new Set<string>();
  const idsDeFasePropuestos = new Set<string>();
  const sinId: Array<{ claveFase: string; idx: number; tarea: TareaPropuesta }> = [];
  propuesta.phases.forEach((p, i) => {
    if (p.id) idsDeFasePropuestos.add(p.id);
    const clave = claveDeFase(p, i);
    (p.tasks ?? []).forEach((t, j) => {
      if (t.id) idsPropuestos.add(t.id);
      else sinId.push({ claveFase: clave, idx: j, tarea: t });
    });
  });

  /* MUDANZA: el saneo de la ruta le quita el id a una tarea que cambia de fase, así que llega
     como «se fue de acá» + «nació allá». Como DOS ítems, aceptar uno solo duplica la tarea o la
     pierde — sin que nada avise. Se reconocen por título exacto normalizado y se emiten como UNO.
     Deliberadamente estricto: con dos candidatas del mismo título no se adivina, y quedan como
     los dos ítems sueltos que realmente son. */
  const mudanzas = new Map<string, { claveFaseDestino: string; tarea: TareaPropuesta }>();
  const destinosDeMudanza = new Set<string>();
  const consumidas = new Set<string>();
  for (const [id, t] of tareaActualPorId) {
    if (idsPropuestos.has(id)) continue;
    const faseOrigen = faseDeTarea.get(id);
    const candidatas = sinId.filter(
      (c) =>
        huella(c.tarea.title) === huella(t.title) &&
        c.claveFase !== faseOrigen &&
        !consumidas.has(`${c.claveFase}:${c.idx}`),
    );
    if (candidatas.length !== 1) continue;
    const c = candidatas[0];
    consumidas.add(`${c.claveFase}:${c.idx}`);
    destinosDeMudanza.add(`${c.claveFase}:${c.idx}`);
    mudanzas.set(id, { claveFaseDestino: c.claveFase, tarea: c.tarea });
  }

  return {
    faseActualPorId,
    tareaActualPorId,
    faseDeTarea,
    mudanzas,
    destinosDeMudanza,
    idsPropuestos,
    idsDeFasePropuestos,
  };
}

/**
 * Descompone la propuesta en ítems resolubles uno por uno.
 * `anclaActual` es el ISO (o null) del cronograma vivo.
 */
export function diffAssist(
  actuales: FaseActual[],
  propuesta: PropuestaDelAssist,
  anclaActual: string | null,
): ItemDeAssist[] {
  const m = indexar(actuales, propuesta);
  const items: ItemDeAssist[] = [];

  // ── El ancla ────────────────────────────────────────────────────────────────
  const anclaPropuesta = propuesta.anchorStartDate ?? null;
  if (anclaPropuesta !== null && dia(anclaPropuesta) !== dia(anclaActual)) {
    items.push({
      key: "ancla",
      clase: "ancla",
      titulo: "Cambia la fecha de arranque",
      detalle: `${dia(anclaActual) || "sin fecha"} → ${dia(anclaPropuesta)}`,
      fase: "Todo el cronograma",
      pesado: true, // redefine TODAS las fechas del cronograma
    });
  }

  // ── El orden de las fases existentes, como un solo hecho ────────────────────
  const ordenActual = actuales.map((p) => p.id);
  const ordenPropuesto = propuesta.phases
    .map((p) => p.id)
    .filter((id): id is string => !!id && m.faseActualPorId.has(id));
  const sobrevivientesEnOrdenActual = ordenActual.filter((id) => ordenPropuesto.includes(id));
  if (
    ordenPropuesto.length > 1 &&
    ordenPropuesto.join("|") !== sobrevivientesEnOrdenActual.join("|")
  ) {
    items.push({
      key: "orden-fases",
      clase: "orden-fases",
      titulo: "Reordena las fases",
      detalle: ordenPropuesto.map((id) => m.faseActualPorId.get(id)?.name ?? "?").join(" → "),
      fase: "Todo el cronograma",
      pesado: false,
    });
  }

  // ── Fases ───────────────────────────────────────────────────────────────────
  propuesta.phases.forEach((p, i) => {
    if (!p.id) {
      items.push({
        key: `fase-nueva:${i}`,
        clase: "fase-nueva",
        titulo: `Fase nueva: «${p.name}»`,
        detalle: `${p.durationWeeks} ${p.durationWeeks === 1 ? "semana" : "semanas"}${
          (p.tasks?.length ?? 0) > 0 ? ` · ${p.tasks!.length} tareas` : " · sin tareas"
        }`,
        fase: p.name,
        pesado: false,
      });
      return;
    }
    const actual = m.faseActualPorId.get(p.id);
    if (!actual) return; // id desconocido: el saneo de la ruta ya lo convirtió en fase nueva
    const cambios = faseCambio(actual, p);
    if (cambios.length > 0) {
      items.push({
        key: `fase-cambia:${p.id}`,
        clase: "fase-cambia",
        titulo: `Cambia la fase «${actual.name}»`,
        detalle: cambios.join(" · "),
        fase: actual.name,
        pesado: false,
      });
    }
  });

  for (const a of actuales) {
    if (m.idsDeFasePropuestos.has(a.id)) continue;
    const conTrabajo = a.tasks.filter(tieneTrabajoEncima).length;
    items.push({
      key: `fase-se-va:${a.id}`,
      clase: "fase-se-va",
      titulo: `Elimina la fase «${a.name}»`,
      detalle:
        a.tasks.length === 0
          ? "no tiene tareas"
          : `se lleva ${a.tasks.length} ${a.tasks.length === 1 ? "tarea" : "tareas"}` +
            (conTrabajo > 0 ? ` · ${conTrabajo} con trabajo encima` : ""),
      fase: a.name,
      pesado: conTrabajo > 0,
    });
  }

  // ── Tareas ──────────────────────────────────────────────────────────────────
  propuesta.phases.forEach((p, i) => {
    const clave = claveDeFase(p, i);
    const nombreFase = p.id ? (m.faseActualPorId.get(p.id)?.name ?? p.name) : p.name;
    (p.tasks ?? []).forEach((t, j) => {
      if (!t.id) {
        if (m.destinosDeMudanza.has(`${clave}:${j}`)) return; // ya viaja en su ítem de mudanza
        items.push({
          key: `tarea-nueva:${clave}:${j}`,
          clase: "tarea-nueva",
          titulo: `Tarea nueva: «${t.title}»`,
          detalle: `semana ${t.weekIndex + 1}${t.party ? ` · ${t.party}` : ""}`,
          fase: nombreFase,
          pesado: false,
        });
        return;
      }
      const actual = m.tareaActualPorId.get(t.id);
      if (!actual) return;
      const cambios = tareaCambio(actual, t);
      if (cambios.length > 0) {
        items.push({
          key: `tarea-cambia:${t.id}`,
          clase: "tarea-cambia",
          titulo: `Cambia «${actual.title}»`,
          detalle: cambios.join(" · "),
          fase: nombreFase,
          pesado: tieneTrabajoEncima(actual),
        });
      }
    });
  });

  for (const [id, actual] of m.tareaActualPorId) {
    if (m.idsPropuestos.has(id)) continue;
    const faseOrigenId = m.faseDeTarea.get(id);
    const nombreFase = faseOrigenId ? (m.faseActualPorId.get(faseOrigenId)?.name ?? "") : "";
    const mudanza = m.mudanzas.get(id);
    /* ⚠ La mudanza se decide ANTES del corte de abajo: una tarea que se muda DESDE una fase que
       además desaparece sigue siendo una mudanza. Si el corte fuera primero, esa tarea no
       tendría ítem en ninguna de las dos puntas — ni salida ni llegada — y desaparecería
       aceptando el borrado de la fase, en silencio. */
    if (mudanza) {
      const destino = propuesta.phases.find((p, k) => claveDeFase(p, k) === mudanza.claveFaseDestino);
      items.push({
        key: `tarea-se-muda:${id}`,
        clase: "tarea-se-muda",
        titulo: `Mueve «${actual.title}»`,
        detalle: `${nombreFase} → ${destino?.name ?? "otra fase"} · semana ${mudanza.tarea.weekIndex + 1}` +
          (tieneTrabajoEncima(actual) ? " · ⚠ pierde su estado (cambiar de fase la recrea)" : ""),
        fase: nombreFase,
        pesado: tieneTrabajoEncima(actual),
      });
      continue;
    }
    // Si su fase entera se va, el borrado de la tarea NO es un ítem propio: viaja con la fase.
    if (faseOrigenId && !m.idsDeFasePropuestos.has(faseOrigenId)) continue;
    items.push({
      key: `tarea-se-va:${id}`,
      clase: "tarea-se-va",
      titulo: `Elimina «${actual.title}»`,
      detalle: tieneTrabajoEncima(actual) ? "⚠ tiene trabajo encima" : `semana ${actual.weekIndex + 1}`,
      fase: nombreFase,
      pesado: tieneTrabajoEncima(actual),
    });
  }

  return items;
}

/** Las claves de TODOS los ítems — el «aceptar todo» del banner. */
export function todasLasClaves(items: ItemDeAssist[]): Set<string> {
  return new Set(items.map((i) => i.key));
}

/**
 * Reconstruye el payload del PUT con SOLO los ítems aceptados.
 *
 * ⛔ Arranca de `actuales`, nunca de la propuesta: lo que nadie aceptó no puede colarse. Y una
 * fase sin ningún ítem de tarea aceptado sale SIN `tasks` — «no tocar», que en el PUT es lo único
 * que garantiza que no se borre nada por omisión.
 */
export function proyectarAceptados(
  actuales: FaseActual[],
  propuesta: PropuestaDelAssist,
  aceptadas: ReadonlySet<string>,
  anclaActual: string | null,
): PayloadProyectado {
  const m = indexar(actuales, propuesta);
  const propuestaPorId = new Map<string, FasePropuesta>();
  for (const p of propuesta.phases) if (p.id) propuestaPorId.set(p.id, p);

  // Tareas que ENTRAN a una fase por mudanza aceptada, agrupadas por clave de fase destino.
  const entrantes = new Map<string, TareaPropuesta[]>();
  for (const [id, mud] of m.mudanzas) {
    if (!aceptadas.has(`tarea-se-muda:${id}`)) continue;
    const lista = entrantes.get(mud.claveFaseDestino) ?? [];
    lista.push(mud.tarea);
    entrantes.set(mud.claveFaseDestino, lista);
  }

  const construirFase = (a: FaseActual): PayloadProyectado["phases"][number] | null => {
    if (aceptadas.has(`fase-se-va:${a.id}`)) return null;
    const p = propuestaPorId.get(a.id);
    const cambiaFase = !!p && aceptadas.has(`fase-cambia:${a.id}`);
    const base = cambiaFase ? p! : a;
    const duracion = base.durationWeeks;

    /* ── Regla 1: `tasks` solo si algo de esta fase se aceptó ── */
    const nuevasAceptadas: TareaPropuesta[] = [];
    if (p) {
      (p.tasks ?? []).forEach((t, j) => {
        if (t.id) return;
        if (m.destinosDeMudanza.has(`${a.id}:${j}`)) return;
        if (aceptadas.has(`tarea-nueva:${a.id}:${j}`)) nuevasAceptadas.push(t);
      });
    }
    const entra = entrantes.get(a.id) ?? [];
    const hayEdiciones = a.tasks.some((t) => aceptadas.has(`tarea-cambia:${t.id}`));
    const haySalidas = a.tasks.some(
      (t) => aceptadas.has(`tarea-se-va:${t.id}`) || aceptadas.has(`tarea-se-muda:${t.id}`),
    );
    const tocaTareas = nuevasAceptadas.length > 0 || entra.length > 0 || hayEdiciones || haySalidas;

    let tasks: PayloadProyectado["phases"][number]["tasks"];
    if (tocaTareas) {
      const propuestaPorTareaId = new Map<string, TareaPropuesta>();
      for (const t of p?.tasks ?? []) if (t.id) propuestaPorTareaId.set(t.id, t);
      const salida: NonNullable<PayloadProyectado["phases"][number]["tasks"]> = [];
      for (const t of a.tasks) {
        if (aceptadas.has(`tarea-se-va:${t.id}`) || aceptadas.has(`tarea-se-muda:${t.id}`)) continue;
        const cambia = aceptadas.has(`tarea-cambia:${t.id}`) ? propuestaPorTareaId.get(t.id) : undefined;
        salida.push({
          id: t.id,
          title: cambia?.title ?? t.title,
          weekIndex: cambia ? cambia.weekIndex : t.weekIndex,
          order: 0, // se reasigna abajo
          notes: cambia ? (cambia.notes ?? null) : (t.notes ?? null),
          party: cambia && cambia.party !== undefined ? cambia.party : (t.party ?? null),
          type: cambia && cambia.type !== undefined ? cambia.type : (t.type ?? null),
        });
      }
      for (const t of [...nuevasAceptadas, ...entra]) {
        salida.push({
          title: t.title,
          weekIndex: t.weekIndex,
          order: 0,
          notes: t.notes ?? null,
          party: t.party ?? null,
          type: t.type ?? null,
        });
      }
      /* Regla 3: la semana se acota contra la duración EFECTIVA (la que quedó tras aceptar o no
         el cambio de fase). Sin esto, aceptar la tarea sin su fase produce un 422. */
      for (const t of salida) t.weekIndex = Math.max(0, Math.min(t.weekIndex, duracion - 1));
      salida.sort((x, y) => x.weekIndex - y.weekIndex);
      const contadorPorSemana = new Map<number, number>();
      for (const t of salida) {
        const n = contadorPorSemana.get(t.weekIndex) ?? 0;
        t.order = n;
        contadorPorSemana.set(t.weekIndex, n + 1);
      }
      tasks = salida;
    }

    return {
      id: a.id,
      name: base.name,
      order: 0, // se reasigna al final
      durationWeeks: duracion,
      startWeek: nn(base.startWeek),
      sessionCount: nn(base.sessionCount),
      notes: nn(base.notes),
      activityType: nn(base.activityType),
      ...(tasks ? { tasks } : {}),
    };
  };

  // ── La secuencia ────────────────────────────────────────────────────────────
  const sobrevivientes = actuales.filter((a) => !aceptadas.has(`fase-se-va:${a.id}`));
  let orden: FaseActual[] = sobrevivientes;
  if (aceptadas.has("orden-fases")) {
    const posicion = new Map<string, number>();
    propuesta.phases.forEach((p, i) => {
      if (p.id) posicion.set(p.id, i);
    });
    orden = [...sobrevivientes].sort(
      (a, b) => (posicion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posicion.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const phases: PayloadProyectado["phases"] = [];
  for (const a of orden) {
    const f = construirFase(a);
    if (f) phases.push(f);
  }

  // Fases nuevas aceptadas — se agregan al final, con sus tareas (sin id: nacen todas juntas).
  propuesta.phases.forEach((p, i) => {
    if (p.id) return;
    if (!aceptadas.has(`fase-nueva:${i}`)) return;
    const clave = claveDeFase(p, i);
    const nuevas = (p.tasks ?? []).filter((_, j) => !m.destinosDeMudanza.has(`${clave}:${j}`));
    const entra = entrantes.get(clave) ?? [];
    const tasks = [...nuevas, ...entra].map((t) => ({
      title: t.title,
      weekIndex: Math.max(0, Math.min(t.weekIndex, p.durationWeeks - 1)),
      order: 0,
      notes: t.notes ?? null,
      party: t.party ?? null,
      type: t.type ?? null,
    }));
    tasks.sort((x, y) => x.weekIndex - y.weekIndex);
    const contador = new Map<number, number>();
    for (const t of tasks) {
      const n = contador.get(t.weekIndex) ?? 0;
      t.order = n;
      contador.set(t.weekIndex, n + 1);
    }
    phases.push({
      name: p.name,
      order: 0,
      durationWeeks: p.durationWeeks,
      startWeek: nn(p.startWeek),
      sessionCount: nn(p.sessionCount),
      notes: nn(p.notes),
      activityType: nn(p.activityType),
      tasks,
    });
  });

  phases.forEach((p, i) => (p.order = i));

  return {
    // El ancla NUNCA se borra por omisión: sin el ítem aceptado, se conserva la actual.
    anchorStartDate: aceptadas.has("ancla") ? (propuesta.anchorStartDate ?? anclaActual) : anclaActual,
    phases,
  };
}
