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
 *
 * ── LAS CONDICIONES DE M3 Y M4 (P4h, spec §5.9, 2026-09-27) ──────────────────
 * Se miden con el reloj que guardó la propuesta (`Borrador.hoy`: su instante y su política), el mismo que usaron R13 y la
 * reprogramación: medir un día después no cambia el resultado. Sin reloj, las cuatro NO PASAN (no es un «Regenerar
 * todo» de M3 y M4, o se armó antes del deploy).
 *  5. Nada nuevo ni quitado en semanas que ya pasaron (R13): 0 `tarea-nueva` y 0 `tarea-se-va` de la IA en una semana
 *     vencida de una fase con tareas, sobre la estructura que vio el paso 2. No cuentan el kickoff que sobra (lo quita
 *     el sistema aunque sea del pasado, M2) ni lo del chat.
 *  6. Lo que reprogramó el sistema es lo que calcula el código: las casillas `desdeHoy`, el pin y las arrastradas de la
 *     propuesta, contra `reprogramarDesdeHoy` sobre el cronograma de hoy, el borrador sin la reprogramación ni las tareas
 *     del paso 2, el instante y la política del reloj. Wherex en la S18: 8 casillas, 1 pin y 25 arrastradas. Si la
 *     fusión perdiera una arrastrada, o la reprogramación no hubiera corrido, no pasa.
 *  7. La línea 5 dice solo lo que quedó sin hacer donde la regla no reprograma: con la propuesta entera, ninguna tarea
 *     nueva o movida cae en el pasado, y, con lo marcado por defecto, ninguna de las que nombra es una abierta movible de
 *     una fase que el sistema reprogramó con su casilla marcada. Wherex: «Quedaron sin hacer 4 tareas…, en «Semana 0»».
 *  8. Nada hecho ni suspendido cambia de semana con la propuesta como viene (lo marcado por defecto), y ningún cambio que
 *     se pueda marcar (salvo una mudanza sugerida de L7, que nace desmarcada) toca una tarea hecha o suspendida.
 * Se mide recién regenerada, sin tocar el cronograma: la 6 recalcula sobre el cronograma de HOY, y si alguien marcó una
 * tarea entre medio lo dice como diferencia (la 8 no: una arrastrada de una tarea que marcaron hecha queda «ya está», D13).
 *
 * Los textos, en tuteo neutro y cortos (entra en la lista de tuteo de contexto-cronograma.test.ts).
 */
import {
  esArrastrada,
  esMudanzaSugerida,
  esPin,
  estructuraHipotetica,
  leerBorrador,
  ordenCompletoDeLaPropuesta,
  planDeAplicacion,
  resumir,
  type Borrador,
  type CambioFaseCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { claveDelHito, hitosDeLaTarea, hitosDelProyecto, HITOS, type Hito } from "./hitos";
import { atrasadasConLoQueQuedo, mensajeDeLaPropuesta } from "./mensaje-de-la-propuesta";
import { reprogramarDesdeHoy, sinReprogramacion } from "./reprogramar-desde-hoy";
import { semanaVencida } from "./vista-de-la-propuesta";
import { computePhaseRanges, plural } from "./weeks";

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

// ── M3 y M4 ───────────────────────────────────────────────────────────────────

/** Sin el reloj de la propuesta no hay M3 ni M4 que medir. */
export const SIN_RELOJ = "La propuesta no trae el reloj: no es un «Regenerar todo» con fecha de arranque, o se armó antes del deploy.";

const abierta = (status: string) => status === "PENDING" || status === "IN_PROGRESS";
const conAvance = (status: string) => status === "DONE" || status === "SUSPENDED";
const esCambioDeTareaCrudo = (c: unknown) =>
  !!c && typeof c === "object" && typeof (c as { tipo?: unknown }).tipo === "string" && (c as { tipo: string }).tipo.startsWith("tarea");
/** Hasta `n` elementos, citados; «y N más» si sobran. */
const algunos = (xs: readonly string[], n = 6) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} y ${xs.length - n} más`);

/**
 * ⭐ Las cuatro condiciones de M3 y M4 (5 a 8) sobre una propuesta abierta. `guardado` es el JSON tal como está en la base
 * (`pendingProposal`) y `borrador`, lo que da `leerBorrador` de él. `vivo` es el cronograma de HOY y `conSemanaCero`, si el
 * pipeline del proyecto tiene Semana 0 (el mismo `!tieneVozDeHandoffPropia(pipeline)` de la marca del paso 2).
 */
export function medirM3yM4(i: { vivo: Vivo; guardado: Record<string, unknown>; borrador: Borrador; conSemanaCero: boolean }): CondicionMedida[] {
  const { vivo, borrador: b } = i;
  const nombres: Array<[number, string]> = [
    [5, "Nada nuevo ni quitado en semanas que ya pasaron"],
    [6, "Lo que reprogramó el sistema es lo que calcula el código"],
    [7, "La línea 5 nombra solo lo que la regla no reprograma"],
    [8, "Nada hecho ni suspendido cambia de semana"],
  ];
  const reloj = b.hoy;
  if (!reloj || !vivo.ancla) return nombres.map(([numero, nombre]) => ({ numero, nombre, pasa: false, detalle: SIN_RELOJ }));
  const instante = new Date(reloj.instante);
  const tareaViva = new Map(vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, t] as const)));
  const titulo = (id: string) => `«${tareaViva.get(id)?.title ?? id}»`;

  // 5 · R13: lo que la IA agrega o quita en una semana vencida de una fase con tareas (la estructura que vio el paso 2).
  const e = estructuraHipotetica(vivo, b);
  const rangosDeLaEstructura = computePhaseRanges(e.fases);
  const inicioEnLaEstructura = new Map(e.fases.map((f, k) => [f.id, rangosDeLaEstructura[k].start]));
  const conTareas = new Set(vivo.fases.filter((f) => (f.tareas ?? []).length > 0).map((f) => f.id));
  const vencida = (fase: string, semana: number) => {
    const inicio = inicioEnLaEstructura.get(fase);
    return inicio !== undefined && conTareas.has(fase) && semanaVencida(vivo.ancla, inicio, semana, instante);
  };
  const nuevasEnElPasado = b.cambios.filter(
    (c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && !c.porChat && vencida(c.fase, c.tarea.weekIndex),
  );
  const quitadasDelPasado = b.cambios.filter(
    (c): c is CambioTareaSeVa =>
      c.tipo === "tarea-se-va" && !c.porChat && c.delSistema !== "hito" && vencida(c.faseId, tareaViva.get(c.tareaId)?.weekIndex ?? c.desde.weekIndex),
  );
  const cinco: CondicionMedida = {
    numero: 5,
    nombre: nombres[0][1],
    pasa: nuevasEnElPasado.length === 0 && quitadasDelPasado.length === 0,
    detalle:
      nuevasEnElPasado.length === 0 && quitadasDelPasado.length === 0
        ? "0 nuevas y 0 que se quitan en semanas vencidas."
        : [
            nuevasEnElPasado.length > 0 ? `${plural(nuevasEnElPasado.length, "nueva", "nuevas")}: ${algunos(nuevasEnElPasado.map((c) => `«${c.tarea.title}»`))}` : "",
            quitadasDelPasado.length > 0 ? `${quitadasDelPasado.length} que se ${quitadasDelPasado.length === 1 ? "quita" : "quitan"}: ${algunos(quitadasDelPasado.map((c) => titulo(c.tareaId)))}` : "",
          ]
            .filter(Boolean)
            .join("; ") + ".",
  };

  // 6 · Lo del sistema, contra lo que calcula el código: el borrador como estaba al marcar el paso 2 (sin la reprogramación,
  // con lo de la IA del paso 1 restaurado y sin las tareas del paso 2), el reloj de la propuesta y el cronograma de hoy.
  const base = sinReprogramacion(i.guardado);
  const alMarcar = leerBorrador({ ...base, cambios: Array.isArray(base.cambios) ? base.cambios.filter((c) => !esCambioDeTareaCrudo(c)) : [] });
  const esperado = alMarcar
    ? reprogramarDesdeHoy({ vivo, borrador: alMarcar, hoy: instante, politica: reloj.politica, conSemanaCero: i.conSemanaCero })
    : null;
  const deFase = (c: CambioFaseCambia) => `${c.fase} ${c.campo === "startWeek" ? "arranca en" : "dura"} ${String(c.a)}`;
  const delSistema = (cambios: readonly CambioFaseCambia[], tareas: ReadonlyArray<{ tareaId: string; a: { weekIndex?: number } }>) => ({
    casillas: cambios.filter((c) => !c.fijaInicio).map(deFase),
    pins: cambios.filter((c) => !!c.fijaInicio).map(deFase),
    arrastradas: tareas.map((t) => `${titulo(t.tareaId)} a la semana ${String(t.a.weekIndex)}`),
  });
  const visto = delSistema(
    b.cambios.filter((c): c is CambioFaseCambia => c.tipo === "fase-cambia" && !!c.desdeHoy),
    b.cambios.filter(esArrastrada),
  );
  const calculado = delSistema(esperado?.cambios ?? [], esperado?.tareas ?? []);
  const diferencias = (["casillas", "pins", "arrastradas"] as const).flatMap((k) => {
    const faltan = calculado[k].filter((x) => !visto[k].includes(x));
    const sobran = visto[k].filter((x) => !calculado[k].includes(x));
    return [...(faltan.length > 0 ? [`faltan ${algunos(faltan, 3)}`] : []), ...(sobran.length > 0 ? [`sobran ${algunos(sobran, 3)}`] : [])];
  });
  const cuenta = `${plural(visto.casillas.length, "casilla", "casillas")}, ${plural(visto.pins.length, "fase fija", "fases fijas")} y ${plural(visto.arrastradas.length, "tarea que se corre", "tareas que se corren")} con su fase`;
  const seis: CondicionMedida = {
    numero: 6,
    nombre: nombres[1][1],
    pasa: !!alMarcar && diferencias.length === 0,
    detalle: !alMarcar
      ? "El borrador sin la reprogramación no se deja leer."
      : diferencias.length === 0
        ? `${cuenta}, desde la S${reloj.semana} (${reloj.politica.fasesVencidas.replace(/-/g, " ")}).`
        : `${cuenta}; contra lo que calcula el código: ${diferencias.join("; ")}.`,
  };

  /* 7 · La línea 5, con lo marcado por defecto (lo que ve el CSE al abrirla). Lo que nace en el pasado se mide con la
     propuesta ENTERA (la estructura que vio el paso 2): una casilla que nace desmarcada («todo desde hoy», D5) o que el CSE
     desmarcó devuelve al pasado lo que se armó para ella, y eso lo decide una persona, no R13. */
  const sin = b.excluidos ?? [];
  const estadoDeLasTareas = b.tareas?.listas ? ("listas" as const) : null;
  const r = resumir(vivo, b, sin, { tareas: estadoDeLasTareas });
  const entera = resumir(vivo, b, [], { tareas: estadoDeLasTareas });
  const a = atrasadasConLoQueQuedo(vivo, entera, instante);
  const fuera = new Set(sin);
  const reprogramadasConCasilla = new Set(
    b.cambios.filter((c) => c.tipo === "fase-cambia" && !!c.desdeHoy && !esPin(c) && !fuera.has(c.clave)).map((c) => (c as CambioFaseCambia).faseId),
  );
  const rangos = computePhaseRanges(r.proyeccion.fases);
  const quedanEnReprogramadas: string[] = [];
  r.proyeccion.fases.forEach((f, k) => {
    if (!f.id || !reprogramadasConCasilla.has(f.id)) return;
    for (const t of f.tareas) {
      const viva = t.id ? tareaViva.get(t.id) : undefined;
      if (!viva || !abierta(viva.status) || viva.inicioFijado || viva.finFijado) continue;
      if (semanaVencida(r.proyeccion.ancla, rangos[k].start, t.weekIndex, instante, t.status)) quedanEnReprogramadas.push(`«${t.title}» (${f.name})`);
    }
  });
  const linea5 =
    mensajeDeLaPropuesta({
      vivo,
      borrador: b,
      r,
      entera,
      referencias: null,
      atrasos: [],
      cierreFijado: null,
      hoy: instante,
    }).lineas.find((l) => /^⚠ (Quedar?on sin hacer|Quedó sin hacer)|caen? en semanas que ya pasaron/.test(l)) ?? null;
  const siete: CondicionMedida = {
    numero: 7,
    nombre: nombres[2][1],
    pasa: a.nacen === 0 && quedanEnReprogramadas.length === 0,
    detalle:
      (linea5 ? `Dice: ${linea5}` : "Sin línea 5: nada quedó sin hacer.") +
      (a.nacen > 0 ? ` ${plural(a.nacen, "nueva o movida cae", "nuevas o movidas caen")} en el pasado.` : "") +
      (quedanEnReprogramadas.length > 0 ? ` Quedan vencidas en fases que el sistema reprogramó: ${algunos(quedanEnReprogramadas, 4)}.` : ""),
  };

  /* 8 · Nada con avance cambia de semana: con lo marcado por defecto, y ningún cambio que se pueda marcar (salvo una
     mudanza sugerida de L7) sobre una hecha o suspendida. Uno que el plan da «ya está» (D13: la marcaron hecha después de
     la propuesta) no se escribe: no cuenta. */
  const antes = new Map<string, number>();
  const rangosHoy = computePhaseRanges(vivo.fases);
  vivo.fases.forEach((f, k) => {
    for (const t of f.tareas ?? []) antes.set(t.id, rangosHoy[k].start + t.weekIndex);
  });
  const sugeridas = new Set(b.cambios.filter(esMudanzaSugerida).map((c) => c.tareaId));
  const movidas: string[] = [];
  r.proyeccion.fases.forEach((f, k) => {
    for (const t of f.tareas) {
      const viva = t.id ? tareaViva.get(t.id) : undefined;
      if (!viva || !conAvance(viva.status) || sugeridas.has(viva.id)) continue;
      if (rangos[k].start + t.weekIndex !== antes.get(viva.id)) movidas.push(`«${viva.title}»`);
    }
  });
  const tocadas = planDeAplicacion(vivo, b, sin, { tareas: estadoDeLasTareas }).items.flatMap(({ cambio: c, estado }) =>
    (c.tipo === "tarea-cambia" || c.tipo === "tarea-se-va") &&
    (estado === "aplica" || estado === "excluido") &&
    !esMudanzaSugerida(c) &&
    conAvance(tareaViva.get(c.tareaId)?.status ?? "")
      ? [titulo(c.tareaId)]
      : [],
  );
  const conAvanceTotal = [...tareaViva.values()].filter((t) => conAvance(t.status)).length;
  const ocho: CondicionMedida = {
    numero: 8,
    nombre: nombres[3][1],
    pasa: movidas.length === 0 && tocadas.length === 0,
    detalle:
      movidas.length === 0 && tocadas.length === 0
        ? `Las ${conAvanceTotal} hechas o suspendidas quedan en su semana.`
        : [
            movidas.length > 0 ? `Se ${movidas.length === 1 ? "mueve" : "mueven"} ${movidas.length}: ${algunos(movidas)}` : "",
            tocadas.length > 0 ? `${movidas.length > 0 ? "con" : "Con"} un cambio: ${algunos([...new Set(tocadas)])}` : "",
          ]
            .filter(Boolean)
            .join("; ") + ".",
  };

  return [cinco, seis, siete, ocho];
}

/** El renglón de cada condición, como lo imprime el script: «1. PASA · El kickoff que sobra… — Sale del sistema: «X».». */
export function renglonDeLaCondicion(c: CondicionMedida): string {
  return `${c.numero}. ${c.pasa ? "PASA" : "NO PASA"} · ${c.nombre} — ${c.detalle}`;
}
