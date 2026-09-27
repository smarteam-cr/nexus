/**
 * lib/timeline/medicion-de-la-propuesta.ts — LA MEDICIÓN DE UNA PROPUESTA ABIERTA: PASA / NO PASA (M2 P2f, 2026-09-27).
 *
 * Puro y client-safe: sin Prisma, sin red, sin `lib/google`. Lo corre `scripts/medir-propuesta.ts` (SOLO LECTURA) sobre
 * el `pendingProposal` de un proyecto, después de cada «Regenerar todo» de la medición (spec del replanteo §3.7):
 * Elías regenera Wherex 3 veces desde la pantalla, sin aplicar, y el script dice qué condición pasa y cuál no. Vive acá,
 * y no en el script, para probarlo contra lo que escribe la fusión de verdad (borrador-del-detalle.test.ts, «M2 P2f»).
 *
 * ── LAS CONDICIONES DE M2 ────────────────────────────────────────────────────
 *  1. El kickoff que sobra (una pendiente de la IA, con otro kickoff que ya está) sale para quitar, y lo quita el
 *     SISTEMA (`delSistema: "hito"`), no la IA. En Wherex: «Sesión de kick-off del proyecto».
 *  2. Ningún kickoff, cierre o entrega nuevo que el proyecto ya tenía (por la marca que puso R15 o por el título). Lo
 *     que dictó el chat no cuenta: lo pidió una persona.
 *  3. R14: las tareas de la IA que no entran porque repiten una que ya está, 5 o menos (la observación «No entran…»).
 *  4. Las pendientes de semanas que NO pasaron que la propuesta quita, 7 o menos: las de la propuesta del 26-09 (57 que
 *     se iban: 50 del pasado y 7 futuras). Si suben, la orden nueva hace que el modelo no repita pendientes que sirven.
 * M4 le suma las suyas (spec §5.8).
 *
 * Los textos, en tuteo neutro y cortos (entra en la lista de tuteo de contexto-cronograma.test.ts).
 */
import { ordenCompletoDeLaPropuesta, type Borrador, type CambioTareaSeVa, type TareaDelVivo, type Vivo } from "./borrador";
import { claveDelHito, hitosDeLaTarea, hitosDelProyecto, HITOS, type Hito } from "./hitos";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges } from "./weeks";

/** Condición 3: el tope de las que no entran por repetir una que ya está. */
export const TOPE_DE_LAS_QUE_REPITEN = 5;
/** Condición 4: el tope de las pendientes de semanas futuras que se quitan (las 7 de la propuesta del 26-09). */
export const TOPE_DE_LAS_FUTURAS_QUE_SE_VAN = 7;

export interface CondicionMedida {
  numero: number;
  /** Qué se pide, corto. */
  nombre: string;
  pasa: boolean;
  /** Lo que se vio (títulos y números), para decidir sin abrir la base. */
  detalle: string;
}

// ── El cronograma leído con SQL, como lo ve la fusión ─────────────────────────

/** Una fase como la lee el script (SQL, `TimelinePhase`), en su orden. */
export interface FilaDeFase {
  id: string;
  name: string;
  durationWeeks: number;
  startWeek: number | null;
  sessionCount: number | null;
  notes: string | null;
  activityType: string | null;
  status: string;
}
/** Una tarea como la lee el script (SQL, `TimelineTask`), ya ordenada por semana y orden. Las fechas, YYYY-MM-DD. */
export interface FilaDeTarea {
  id: string;
  phaseId: string;
  title: string;
  weekIndex: number;
  notes: string | null;
  party: string | null;
  type: string | null;
  status: string;
  source: string;
  needsValidation: boolean;
  originFingerprint: string | null;
  inicioFijado: string | null;
  finFijado: string | null;
}

/**
 * El vivo a partir de las filas del script: el MISMO que arma `vivoDeLaBase` (borrador-del-detalle.ts) con Prisma, que
 * el script no usa (abre su propia conexión de solo lectura). `ancla` como la da `toISOString()`. La paridad la cuida
 * borrador-del-detalle.test.ts.
 */
export function vivoDeLasFilas(ancla: string | null, fases: readonly FilaDeFase[], tareas: readonly FilaDeTarea[]): Vivo {
  return {
    ancla,
    fases: fases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType ?? null,
      status: f.status,
      tareas: tareas
        .filter((t) => t.phaseId === f.id)
        .map(
          (t): TareaDelVivo => ({
            id: t.id,
            title: t.title,
            weekIndex: t.weekIndex,
            notes: t.notes ?? null,
            party: (t.party ?? null) as TareaDelVivo["party"],
            type: (t.type ?? null) as TareaDelVivo["type"],
            status: t.status,
            source: t.source,
            inicioFijado: t.inicioFijado,
            finFijado: t.finFijado,
            needsValidation: t.needsValidation,
            ...(t.originFingerprint ? { marca: t.originFingerprint } : {}),
          }),
        ),
    })),
  };
}

// ── Las piezas ────────────────────────────────────────────────────────────────

/**
 * Condición 3: cuántas tareas de la IA no entraron por repetir una que ya está, leído de la observación que escribe R14
 * (`observacionDeLasQueNoEntran`, hitos.ts): «No entran N tareas de la IA: M caen en semanas que ya pasaron y K repiten
 * una que ya está.», o con una sola parte y sin repetir el número. 0 si no está.
 */
export function repitenDeLasObservaciones(observaciones: readonly string[]): number {
  for (const o of observaciones) {
    const m = /^No entran? (\d+) tareas? de la IA: (.+)\.$/.exec(o);
    if (!m) continue;
    const total = Number(m[1]);
    const partes = m[2];
    const conNumero = /(\d+) repiten? una que ya está/.exec(partes);
    if (conNumero) return Number(conNumero[1]);
    if (/^repiten? una que ya está$/.test(partes)) return total;
    return 0;
  }
  return 0;
}

/** Lo que conviene saber antes de leer las condiciones: si no es «Regenerar todo» o si las tareas todavía no llegaron. */
export function avisosDeLaMedicion(b: Borrador): string[] {
  const avisos: string[] = [];
  if (b.pedido !== "regenerar" || b.soloFase) avisos.push("No es «Regenerar todo»: la medición es para esa propuesta.");
  if (!b.tareas?.listas) avisos.push("Las tareas de la IA todavía no llegaron: mide cuando lleguen.");
  return avisos;
}

const NOMBRE_DEL_HITO: Record<Hito, string> = { kickoff: "kickoff", cierre: "cierre", entrega: "entrega" };
const citar = (xs: readonly string[]) => xs.map((x) => `«${x}»`).join(", ");

/**
 * ⭐ Las cuatro condiciones de M2 sobre una propuesta abierta. `vivo` es el cronograma de HOY (con la marca de cada
 * tarea), `recurrente` el tag del proyecto y `hoy` el instante de la medición (decide qué semanas ya pasaron).
 */
export function medirM2(i: { vivo: Vivo; borrador: Borrador; recurrente: boolean; hoy: Date }): CondicionMedida[] {
  const { vivo, borrador: b } = i;
  const hitos = hitosDelProyecto({
    fases: vivo.fases.map((f) => ({ id: f.id, name: f.name, tareas: f.tareas ?? [] })),
    recurrente: i.recurrente,
  });
  const faseViva = new Map(vivo.fases.map((f) => [f.id, f]));
  const tareaViva = new Map(vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, t] as const)));
  const seVanPorTarea = new Map(
    b.cambios.filter((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va").map((c) => [c.tareaId, c] as const),
  );

  // 1 · El kickoff que sobra, fuera y por el sistema. Una fase terminada no se toca en «Regenerar todo» (R12).
  const sobrantes = hitos.sobrantes.filter((s) => faseViva.get(s.faseId)?.status !== "DONE");
  const mal = sobrantes.flatMap((s) => {
    const titulo = tareaViva.get(s.tareaId)?.title ?? s.tareaId;
    const c = seVanPorTarea.get(s.tareaId);
    if (!c) return [`«${titulo}» no sale`];
    if (c.delSistema !== "hito") return [`«${titulo}» sale, pero como de la IA`];
    return [];
  });
  const uno: CondicionMedida = {
    numero: 1,
    nombre: "El kickoff que sobra sale para quitar, del sistema",
    pasa: mal.length === 0,
    detalle:
      sobrantes.length === 0
        ? "No hay kickoff que sobre."
        : mal.length > 0
          ? `${mal.join("; ")}.`
          : `Sale del sistema: ${citar(sobrantes.map((s) => tareaViva.get(s.tareaId)?.title ?? s.tareaId))}.`,
  };

  // 2 · Ningún hito nuevo que ya estaba (la marca de R15 o el título, con la fase como quedaría).
  const orden = ordenCompletoDeLaPropuesta(vivo, b.cambios);
  const ultima = orden[orden.length - 1] ?? null;
  const nombreDeFase = new Map<string, string>([
    ...vivo.fases.map((f) => [f.id, f.name] as const),
    ...b.cambios.flatMap((c) => (c.tipo === "fase-nueva" ? [[c.clave, c.fase.name] as const] : [])),
  ]);
  const repetidos: string[] = [];
  const nuevosQueFaltaban: string[] = [];
  for (const c of b.cambios) {
    if (c.tipo !== "tarea-nueva" || c.porChat) continue;
    const porTitulo = hitosDeLaTarea({ title: c.tarea.title, type: c.tarea.type }, { name: nombreDeFase.get(c.fase) ?? "", esUltima: c.fase === ultima });
    const suyos = HITOS.filter((h) => (c.tarea.hito ?? []).includes(h) || porTitulo.includes(h));
    for (const h of suyos) {
      const ciclo = h === "entrega" && i.recurrente ? (hitos.ciclos.get(c.fase) ?? null) : null;
      // Una entrega de un recurrente en una fase nueva: su ciclo no se sabe sin aplicar; no se juzga.
      if (h === "entrega" && i.recurrente && ciclo === null) continue;
      const guardian = hitos.guardianes.get(claveDelHito(h, ciclo));
      if (guardian) repetidos.push(`«${c.tarea.title}» (${NOMBRE_DEL_HITO[h]}; ya está «${guardian.titulo}»)`);
      else nuevosQueFaltaban.push(`«${c.tarea.title}» (${NOMBRE_DEL_HITO[h]})`);
    }
  }
  const dos: CondicionMedida = {
    numero: 2,
    nombre: "Ningún kickoff, cierre o entrega nuevo que ya estaba",
    pasa: repetidos.length === 0,
    detalle:
      (repetidos.length > 0 ? `Entran igual: ${repetidos.join(", ")}.` : "Ninguno.") +
      (nuevosQueFaltaban.length > 0 ? ` Entran porque faltaban: ${nuevosQueFaltaban.join(", ")}.` : ""),
  };

  // 3 · R14: las que no entran por repetir una que ya está.
  const repiten = repitenDeLasObservaciones(b.observaciones);
  const tres: CondicionMedida = {
    numero: 3,
    nombre: `No entran por repetir una que ya está: ${TOPE_DE_LAS_QUE_REPITEN} o menos`,
    pasa: repiten <= TOPE_DE_LAS_QUE_REPITEN,
    detalle: `${repiten} ${repiten === 1 ? "repite" : "repiten"} una que ya está.`,
  };

  // 4 · Las pendientes de semanas que no pasaron que se quitan (sin las del sistema ni las del chat).
  const rangos = computePhaseRanges(vivo.fases);
  const lugar = new Map(vivo.fases.map((f, k) => [f.id, k]));
  const seVan = b.cambios.filter((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va" && !c.delSistema && !c.porChat);
  const futuras = seVan.filter((c) => {
    const k = lugar.get(c.faseId);
    const t = tareaViva.get(c.tareaId);
    if (k === undefined || !t) return false;
    return !semanaVencida(vivo.ancla, rangos[k].start, t.weekIndex, i.hoy);
  });
  const cuatro: CondicionMedida = {
    numero: 4,
    nombre: `Pendientes de semanas que no pasaron que se quitan: ${TOPE_DE_LAS_FUTURAS_QUE_SE_VAN} o menos`,
    pasa: futuras.length <= TOPE_DE_LAS_FUTURAS_QUE_SE_VAN,
    detalle:
      `${futuras.length} de ${seVan.length} que quita la IA.` +
      (vivo.ancla ? "" : " Sin fecha de arranque: todas cuentan como futuras.") +
      (futuras.length > TOPE_DE_LAS_FUTURAS_QUE_SE_VAN ? ` ${citar(futuras.slice(0, 10).map((c) => c.desde.title))}.` : ""),
  };

  return [uno, dos, tres, cuatro];
}

/** El renglón de cada condición, como lo imprime el script: «1. PASA · El kickoff que sobra… — Sale del sistema: «X».». */
export function renglonDeLaCondicion(c: CondicionMedida): string {
  return `${c.numero}. ${c.pasa ? "PASA" : "NO PASA"} · ${c.nombre} — ${c.detalle}`;
}
