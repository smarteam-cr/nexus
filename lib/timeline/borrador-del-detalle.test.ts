/**
 * lib/timeline/borrador-del-detalle.test.ts — L5 (§6.3): LO QUE YA HAY en cada fase, como lo arma el servidor
 * para el agente de tareas (`estructuraParaElDetalle` → `loQueYaHay`).
 *
 * Correr: `npx vitest run lib/timeline/borrador-del-detalle.test.ts --project unit`.
 *
 * El agente de tareas leía solo las fases y reescribía todo. Desde L5 lee qué fases están terminadas o en
 * curso, qué se hizo, qué está pendiente y lo que notó el paso 1. Lo que cuida esta guarda, con la base
 * FALSA (la función real corre contra esto):
 *   1. «Regenerar todo»: las terminadas se nombran para no tocarse, y lo pendiente es solo lo que la IA puede
 *      conservar (pendiente y no escrito a mano), con su `weekIndex`;
 *   2. «Regenerar» de una fase y el recálculo van CON alcance: ninguna terminada que respetar (D11: ahí «lo que
 *      ya se hizo va como tarea» manda).
 * Cada `it` nombra la edición que lo pone en rojo.
 *
 * L6 (§7.4, §7.6): la fusión pide EL PORQUÉ (`extras.explicar`, acá un doble: ningún test llama a la API) antes de su
 * escritura y lo guarda en la MISMA escritura, con la huella de la lista que escribe; con tope de 15 s, sin tirar y
 * una sola vez aunque la escritura necesite otra vuelta.
 *
 * M3 (2026-09-27): el reloj de la propuesta (`hoy`) que guarda la marca del paso 2, lo que lee el modelo con él (lo
 * vencido fuera de «pendiente» y el bloque «LO QUE YA PASÓ») y la fusión real que le pasa `pasado` a R13.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn() },
  agentRun: { update: vi.fn() },
  // M3: la marca del vacío deduce el pedido de las tareas (`marcarTareasEnCurso`).
  timelineTask: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  borradorVacio,
  claveDeTareaQueSeVa,
  esVacioEsperandoTareas,
  fotoDeTarea,
  leerBorrador,
  modoDeLaPropuesta,
  planDeAplicacion,
  traeCambiosDeFases,
  type Borrador,
  type Cambio,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type Vivo,
} from "./borrador";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  marcarTareasEnCurso,
  QUEDO_SIN_HACER,
  SELECT_DE_FASES_CON_TAREAS,
  TOPE_DE_LA_EXPLICACION_MS,
  TOPE_DE_LAS_SUGERIDAS_MS,
  vivoDeLaBase,
} from "./borrador-del-detalle";
import { renderLoQueYaHay, TITULO_DE_LO_QUE_YA_PASO } from "@/lib/contexto/detalle-cronograma";
import { POLITICA_DE_ATRASOS } from "./politica-de-atrasos";
import { pipelineByKey } from "@/lib/projects/kind";
import { tareasTocadas } from "./hechas-fuera-de-lugar";
import { explicacionEnPantalla, huellaDeLosCambios, type ExplicacionSinSello } from "./explicacion-de-la-propuesta";
import { observacionDeLasQueNoEntran } from "./hitos";
import { porQueDeSoloLectura } from "./propuesta-para-el-chat";
import { leerFixtureGrande } from "./__fixtures__/propuesta-grande";
import {
  avisosDeLaMedicion,
  medirM2,
  renglonDeLaCondicion,
  repitenDeLasObservaciones,
  vivoDeLasFilas,
  type FilaDeFase,
  type FilaDeTarea,
} from "./medicion-de-la-propuesta";

const tareaDB = (id: string, title: string, weekIndex: number, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  weekIndex,
  order: 0,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  startDateOverride: null,
  dueDateOverride: null,
  needsValidation: false,
  ...extra,
});
const faseDB = (id: string, name: string, order: number, durationWeeks: number, status: string, tasks: unknown[]) => ({
  id,
  name,
  order,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  status,
  tasks,
});

const LARGO = "Configurar las propiedades personalizadas del objeto Negocios para ventas y para postventa, con sus vistas";
/** Kick-off terminada · Diseño en curso (hecha, pendiente de la IA, escrita a mano, en curso, retocada) · Pruebas. */
const FASES = [
  faseDB("a", "Kick-off", 0, 1, "DONE", [
    tareaDB("a1", "Reunión de arranque", 0, { status: "DONE", source: "HUMAN" }),
    tareaDB("a2", LARGO, 0, { status: "DONE" }),
  ]),
  faseDB("b", "Diseño", 1, 2, "IN_PROGRESS", [
    tareaDB("b1", "Mapear procesos", 0, { status: "DONE" }),
    tareaDB("b5", "Ajustar vistas", 0, { source: "MODIFIED" }),
    tareaDB("b2", "Definir pipeline", 1),
    tareaDB("b3", "Revisar con el cliente", 1, { source: "HUMAN" }),
    tareaDB("b4", "Armar reportes", 1, { status: "IN_PROGRESS" }),
  ]),
  faseDB("c", "Pruebas", 2, 3, "PENDING", [tareaDB("c1", "Probar flujos", 2)]),
];
const OBSERVACIONES = ["Diseño sigue en curso; el paso de tareas debe contemplarlo."];
const enLaBase = (guardado: unknown) =>
  db.projectTimeline.findUnique.mockResolvedValue({
    pendingProposal: JSON.parse(JSON.stringify(guardado)),
    anchorStartDate: null,
    closeDateOverride: null,
    phases: FASES,
  });

beforeEach(() => {
  db.projectTimeline.findUnique.mockReset();
  db.projectTimeline.updateMany.mockReset();
  db.agentRun.update.mockReset();
  db.timelineTask.findMany.mockReset();
});

describe("L5 · lo que ya hay en cada fase, para el agente de tareas", () => {
  it("⭐ «Regenerar todo»: estado de cada fase, lo hecho, lo pendiente de la IA con su weekIndex, y las terminadas que no se tocan", async () => {
    /* Las ediciones que la ponen en rojo: listar como pendiente lo escrito a mano o lo que está en curso (el
       agente creería que puede reescribirlo), o no nombrar la terminada (la IA le volvía a proponer tareas). */
    enLaBase(borradorVacio({ pedido: "regenerar", corrida: "run-2", observaciones: OBSERVACIONES }));
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    const l = sobre?.loQueYaHay;
    expect(l, "el paso 2 no recibe lo que ya hay").toBeDefined();
    expect(l!.conAlcance).toBe(false);
    expect(l!.terminadasQueNoSeTocan).toEqual(["a"]);
    expect(l!.observaciones).toEqual(OBSERVACIONES);
    expect(l!.fases.map((f) => [f.id, f.estado])).toEqual([
      ["a", "terminada"],
      ["b", "en curso"],
      ["c", "pendiente"],
    ]);
    const [kickoff, diseno, pruebas] = l!.fases;
    expect(kickoff.hechas).toEqual(["Reunión de arranque", `${LARGO.slice(0, 79)}…`]);
    expect(kickoff.hechas[1].length).toBe(80);
    expect(diseno.hechas).toEqual(["Mapear procesos"]);
    expect(diseno.pendientes, "lo pendiente tiene que ser solo lo que la IA puede conservar").toEqual([
      { titulo: "Ajustar vistas", semana: 0 },
      { titulo: "Definir pipeline", semana: 1 },
    ]);
    expect(pruebas.pendientes).toEqual([{ titulo: "Probar flujos", semana: 2 }]);
  });

  it("⛔ «Regenerar» de una fase: con alcance, y ninguna terminada que respetar (D11)", async () => {
    /* La edición que la pone en rojo: llenar `terminadasQueNoSeTocan` o dejar `conAlcance` en false con
       `soloFase`: el mensaje diría «lo hecho no se vuelve a proponer» y chocaría con «lo que ya se hizo va como
       tarea» de la fase que el CSE pidió regenerar. */
    enLaBase(borradorVacio({ pedido: "regenerar", corrida: "run-f", soloFase: "a" }));
    const l = (await estructuraParaElDetalle("tl", "run-f"))?.loQueYaHay;
    expect(l?.conAlcance).toBe(true);
    expect(l?.terminadasQueNoSeTocan).toEqual([]);
    // Lo que ya hay se sigue diciendo: sirve para conservar lo pendiente.
    expect(l?.fases.find((f) => f.id === "b")?.pendientes.map((p) => p.titulo)).toEqual(["Ajustar vistas", "Definir pipeline"]);
  });

  it("⛔ el recálculo: también con alcance", async () => {
    enLaBase({
      ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }),
      tareas: { corrida: "run-2", listas: true },
      recalculo: { corrida: "run-r", fases: [{ id: "c", nombre: "Pruebas" }], sin: [] },
    });
    const l = (await estructuraParaElDetalle("tl", "run-r"))?.loQueYaHay;
    expect(l?.conAlcance).toBe(true);
    expect(l?.terminadasQueNoSeTocan).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── L6 · EL PORQUÉ, en la misma escritura de la fusión ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("L6 · la fusión guarda el porqué en la MISMA escritura", () => {
  /** El borrador vacío de «Regenerar todo» esperando las tareas de «run-2», como lo leen la estructura y la fusión. */
  const GUARDADO = borradorVacio({ pedido: "regenerar", corrida: "run-2" });
  const enLaBaseParaFusionar = () =>
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify(GUARDADO)),
      pendingProposalRunId: "run-2",
      anchorStartDate: null,
      closeDateOverride: null,
      project: { tags: [] },
      phases: FASES,
    }));
  /** Lo que armó el agente: dos tareas nuevas y lo demás igual. */
  const tarea = (title: string, weekIndex: number) => ({ title, weekIndex, notes: null, porValidar: false, party: "SMARTEAM", type: "TASK" });
  const SALIDA = {
    timelineDetail: {
      phases: [
        { id: "a", tasks: [] },
        { id: "b", tasks: [tarea("Ajustar vistas", 0), tarea("Definir pipeline", 1), tarea("Configurar integraciones", 0)] },
        { id: "c", tasks: [tarea("Probar flujos", 2), tarea("Capacitar al equipo", 1)] },
      ],
    },
    fuentesDeLaGeneracion: { instrucciones: "", sesiones: [], en: "2026-09-26T18:00:00.000Z" },
  };
  const EXPLICACION: ExplicacionSinSello = {
    general: null,
    fases: [{ fase: "b", frase: "Se suma porque la reunión nueva pide integrar antes de probar.", fuentes: [{ tipo: "reunion", titulo: "Diseño", fecha: null }] }],
    sinMaterial: ["c"],
    desde: "2026-09-25T15:00:00.000Z",
  };
  async function fusionar(explicar?: (e: { vivo: Vivo; cambios: readonly Cambio[] }) => Promise<ExplicacionSinSello | null>) {
    enLaBaseParaFusionar();
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    let k = 0;
    return fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-2",
      estructura: sobre!.estructura,
      analysisJson: SALIDA,
      huellas: null,
      cortado: false,
      nuevaClave: () => `k-${++k}`,
      ...(explicar ? { extras: { explicar } } : {}),
    });
  }
  const escrito = (n = 0) => db.projectTimeline.updateMany.mock.calls[n][0].data.pendingProposal as Record<string, unknown>;

  afterEach(() => vi.useRealTimers());

  it("⭐ la explicación va en la MISMA escritura, con la huella de la lista que se escribe (recién fusionada, no es vieja)", async () => {
    /* Las ediciones que la ponen en rojo: escribirla en otro `update` (una segunda escritura se pierde con las casillas
       o el chat de por medio), o calcular la huella antes de sumar lo último (la pantalla la diría «de cuando se
       generó» apenas llega). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const pedidas: Array<readonly Cambio[]> = [];
    const r = await fusionar(async (e) => {
      pedidas.push(e.cambios);
      return EXPLICACION;
    });
    expect(r.estado).toBe("listas");
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    const g = escrito();
    expect((g.cambios as Cambio[]).length).toBeGreaterThan(0);
    expect(pedidas, "se explicó otra lista que la que se escribe").toEqual([g.cambios]);
    expect(g.explicacion).toEqual({ ...EXPLICACION, corrida: "run-2", version: g.version, huellaDeCambios: huellaDeLosCambios(g.cambios as Cambio[]) });
    expect(explicacionEnPantalla(JSON.parse(JSON.stringify(g)))?.vieja, "recién fusionada ya se ve «de cuando se generó»").toBe(false);
    // Escaneo: el único lugar que la escribe es el tramo de la escritura de la fusión.
    const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/borrador-del-detalle.ts"), "utf8").replace(/\r\n/g, "\n");
    const i = src.indexOf("pendingProposal: conLaFusion(\n        tl.pendingProposal as Record<string, unknown>,");
    const tramo = src.slice(i, src.indexOf("if (escrita.count === 0)", i));
    expect(i).toBeGreaterThan(0);
    expect(tramo).toContain("cambios: cambiosFinales,");
    expect(tramo).toContain("explicacion: {");
    expect(tramo).toContain("huellaDeCambios: huellaDeLosCambios(cambiosFinales),");
    expect(src.match(/explicacion: \{/g)?.length, "la explicación se escribe en otra escritura").toBe(1);
  });

  it("⭐ con un doble de 20 s, la fusión escribe SIN explicación en ≤ 16 s", async () => {
    /* La edición que la pone en rojo: esperar la llamada sin su tope (el paso 2 quedaría colgado de Haiku). */
    vi.useFakeTimers();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const t0 = Date.now();
    let termino = false;
    const fusion = fusionar(() => new Promise((ok) => setTimeout(() => ok(EXPLICACION), 20_000))).then((r) => {
      termino = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(TOPE_DE_LA_EXPLICACION_MS);
    expect(termino, "la fusión esperó a la IA más de 15 s").toBe(true);
    expect(Date.now() - t0).toBeLessThanOrEqual(16_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await fusion).estado).toBe("listas");
    expect(escrito().explicacion).toBeUndefined();
    expect(TOPE_DE_LA_EXPLICACION_MS).toBe(15_000);
  });

  it("⭐ si la llamada tira (el tope diario de IA, la red), la propuesta se escribe igual, sin explicación", async () => {
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const r = await fusionar(async () => {
      throw new Error("Presupuesto de IA agotado");
    });
    expect(r.estado).toBe("listas");
    expect(escrito().explicacion).toBeUndefined();
    // Aunque tire antes de dar su promesa.
    db.projectTimeline.updateMany.mockClear();
    const r2 = await fusionar(() => {
      throw new Error("antes de la promesa");
    });
    expect(r2.estado).toBe("listas");
    expect(escrito().explicacion).toBeUndefined();
  });

  it("⭐ si la escritura no entra, la vuelta siguiente NO vuelve a llamar y escribe la misma explicación", async () => {
    /* La edición que la pone en rojo: pedirla en cada vuelta (se paga dos veces), o perderla en la segunda. */
    db.projectTimeline.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    let llamadas = 0;
    const r = await fusionar(async () => {
      llamadas++;
      return EXPLICACION;
    });
    expect(r.estado).toBe("listas");
    expect(llamadas).toBe(1);
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(2);
    expect(escrito(1).explicacion).toMatchObject({ fases: EXPLICACION.fases, corrida: "run-2" });
  });

  it("⭐ sin `extras`, la propuesta se escribe como antes (sin la clave)", async () => {
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    await fusionar();
    expect("explicacion" in escrito()).toBe(false);
  });

  it("⭐ una fusión PERDIDA deja en la corrida la salida completa (con lo que leyó)", async () => {
    /* La edición que la pone en rojo: que la ruta pase `analysisJson` sin las fuentes: `avisarEnLaCorrida` pisa el
       `output` con lo que recibe, y la generación siguiente no sabría qué es nuevo. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 0 });
    let llamadas = 0;
    const r = await fusionar(async () => {
      llamadas++;
      return EXPLICACION;
    });
    expect(r.estado).toBe("perdido");
    expect(llamadas).toBe(1);
    const output = JSON.parse(db.agentRun.update.mock.calls.at(-1)![0].data.output as string);
    expect(output.fuentesDeLaGeneracion).toEqual(SALIDA.fuentesDeLaGeneracion);
    expect(output.timelineSyncError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── L7 · las HECHAS en la fase equivocada, en la misma escritura ─────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L7 (§8.4, §8.5): en «Regenerar todo» la fusión pide las hechas que parecen de otra fase (`extras.ubicarHechas`, acá un
 * doble: ningún test llama a la API) EN PARALELO con el porqué, las suma a la lista que escribe DESMARCADAS (sus claves
 * en `excluidos`) y la huella de la explicación sale de esa lista, con ellas.
 */
describe("L7 · la fusión suma las mudanzas sugeridas, desmarcadas", () => {
  const tarea = (title: string, weekIndex: number) => ({ title, weekIndex, notes: null, porValidar: false, party: "SMARTEAM", type: "TASK" });
  const SALIDA = {
    timelineDetail: {
      phases: [
        { id: "a", tasks: [] },
        // Sin «Definir pipeline» (b2): la propuesta la quita, así que ya la toca un cambio.
        { id: "b", tasks: [tarea("Ajustar vistas", 0), tarea("Configurar integraciones", 0)] },
        { id: "c", tasks: [tarea("Probar flujos", 2), tarea("Capacitar al equipo", 1)] },
      ],
    },
    fuentesDeLaGeneracion: { instrucciones: "", sesiones: [], en: "2026-09-26T18:00:00.000Z" },
  };
  /** «Mapear procesos» (hecha, en Diseño) que la IA sugiere mudar a «Pruebas». */
  const SUGERIDA: CambioTareaCambia = {
    tipo: "tarea-cambia",
    clave: "tarea:b1:cambia",
    tareaId: "b1",
    faseId: "b",
    desde: { title: "Mapear procesos", weekIndex: 0, notes: null, party: "SMARTEAM", type: "TASK", inicioFijado: null, finFijado: null },
    a: { fase: "c" },
    motivo: "Parece de «Pruebas»",
    sugerida: "otra-fase",
  };
  const EXPLICACION: ExplicacionSinSello = { general: null, fases: [], sinMaterial: ["b"], desde: null };
  type Ubicar = (e: { vivo: Vivo; tocadas: ReadonlySet<string> }) => Promise<CambioTareaCambia[]>;
  /** Lo desmarcado de antes (una casilla de fase): tiene que sobrevivir a que se sumen las sugeridas. */
  const DESMARCADO = "fase:c:durationWeeks";
  async function fusionar(guardado: ReturnType<typeof borradorVacio>, extras: { explicar?: () => Promise<ExplicacionSinSello | null>; ubicarHechas?: Ubicar }) {
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify({ ...guardado, excluidos: [DESMARCADO] })),
      pendingProposalRunId: "run-2",
      anchorStartDate: null,
      closeDateOverride: null,
      project: { tags: [] },
      phases: FASES,
    }));
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    let k = 0;
    return fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-2",
      estructura: sobre!.estructura,
      analysisJson: SALIDA,
      huellas: null,
      cortado: false,
      nuevaClave: () => `k-${++k}`,
      extras,
    });
  }
  const escrito = (n = 0) => db.projectTimeline.updateMany.mock.calls[n][0].data.pendingProposal as Record<string, unknown>;
  const cambiosEscritos = (n = 0) => escrito(n).cambios as Cambio[];
  const conLaSugerida = (n = 0) => cambiosEscritos(n).some((c) => c.clave === SUGERIDA.clave);
  const REGENERAR = borradorVacio({ pedido: "regenerar", corrida: "run-2" });

  afterEach(() => vi.useRealTimers());

  it("⭐ nacen desmarcadas: la sugerida va en la lista que se escribe, con su clave en `excluidos`, y el plan la da «excluido»", async () => {
    /* La edición que la pone en rojo: no sumarlas a `excluidos` (una hecha se mudaba con «Aplicar todo» sin que nadie
       marcara su casilla). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const pedidas: Array<ReadonlySet<string>> = [];
    const r = await fusionar(REGENERAR, {
      ubicarHechas: async (e) => {
        pedidas.push(e.tocadas);
        return [SUGERIDA];
      },
    });
    expect(r.estado).toBe("listas");
    expect(pedidas).toHaveLength(1);
    const cambios = cambiosEscritos();
    expect(cambios.at(-1), "la sugerida no está en la lista escrita").toEqual(SUGERIDA);
    expect([...pedidas[0]].sort(), "`tocadas` no son las tareas que ya cambian").toEqual([...tareasTocadas(cambios.slice(0, -1))].sort());
    expect(escrito().excluidos, "nació marcada (o se perdió lo desmarcado de antes)").toEqual([DESMARCADO, SUGERIDA.clave]);
    const leido = leerBorrador(JSON.parse(JSON.stringify(escrito())))!;
    const vivo = vivoDeLaBase(null, FASES as unknown as Parameters<typeof vivoDeLaBase>[1]);
    const plan = planDeAplicacion(vivo, leido, escrito().excluidos as string[], { tareas: "listas" });
    expect(plan.items.find((it) => it.cambio.clave === SUGERIDA.clave)?.estado).toBe("excluido");
    expect(plan.sugeridasSinMarcar).toBe(1);
  });

  it("⭐ la huella de la explicación sale de la lista CON las sugeridas: recién fusionada, no es vieja", async () => {
    /* La edición que la pone en rojo: calcular la huella sin las sugeridas (la pantalla diría «(de cuando se generó)»
       apenas llega la propuesta). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    await fusionar(REGENERAR, { explicar: async () => EXPLICACION, ubicarHechas: async () => [SUGERIDA] });
    expect(conLaSugerida()).toBe(true);
    expect((escrito().explicacion as { huellaDeCambios: string }).huellaDeCambios).toBe(huellaDeLosCambios(cambiosEscritos()));
    expect(explicacionEnPantalla(JSON.parse(JSON.stringify(escrito())))?.vieja).toBe(false);
  });

  it("⭐ las dos llamadas van EN PARALELO: con dos dobles de 10 s, la fusión escribe a los 10 s, no a los 20; con 20 s, sin ellas", async () => {
    /* La edición que la pone en rojo: esperar una y después la otra (el paso 2 esperaría hasta 30 s), o esperarlas sin
       su tope. */
    vi.useFakeTimers();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    let termino = false;
    const fusion = fusionar(REGENERAR, {
      explicar: () => new Promise((ok) => setTimeout(() => ok(EXPLICACION), 10_000)),
      ubicarHechas: () => new Promise((ok) => setTimeout(() => ok([SUGERIDA]), 10_000)),
    }).then((r) => {
      termino = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(10_500);
    expect(termino, "la fusión esperó una llamada después de la otra").toBe(true);
    expect((await fusion).estado).toBe("listas");
    expect(escrito().explicacion).toBeDefined();
    expect(cambiosEscritos().at(-1)).toEqual(SUGERIDA);
    db.projectTimeline.updateMany.mockClear();
    termino = false;
    const lenta = fusionar(REGENERAR, { ubicarHechas: () => new Promise((ok) => setTimeout(() => ok([SUGERIDA]), 20_000)) }).then((r) => {
      termino = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(TOPE_DE_LAS_SUGERIDAS_MS + 500);
    expect(termino, "la fusión esperó las sugeridas más de 15 s").toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await lenta).estado).toBe("listas");
    expect(conLaSugerida()).toBe(false);
    expect(escrito().excluidos).toEqual([DESMARCADO]);
    expect(TOPE_DE_LAS_SUGERIDAS_MS).toBe(15_000);
  });

  it("⛔ solo en «Regenerar todo»: ni en «Regenerar» de una fase ni en «Generar cronograma»; y si tira, sin ellas", async () => {
    /* La edición que la pone en rojo: pedirlas siempre (en una fase regenerada, una hecha de otra fase se mudaría fuera
       del alcance que pidió el CSE). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    let llamadas = 0;
    const ubicarHechas: Ubicar = async () => {
      llamadas++;
      return [SUGERIDA];
    };
    await fusionar(borradorVacio({ pedido: "regenerar", corrida: "run-2", soloFase: "b" }), { ubicarHechas });
    await fusionar(borradorVacio({ pedido: "primera", corrida: "run-2" }), { ubicarHechas });
    expect(llamadas).toBe(0);
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(2);
    for (const n of [0, 1]) expect(conLaSugerida(n)).toBe(false);
    db.projectTimeline.updateMany.mockClear();
    const r = await fusionar(REGENERAR, {
      ubicarHechas: async () => {
        throw new Error("Presupuesto de IA agotado");
      },
    });
    expect(r.estado).toBe("listas");
    expect(conLaSugerida()).toBe(false);
  });

  it("⭐ si la escritura no entra, la vuelta siguiente no vuelve a llamar; y una sugerida de una tarea que ya cambia no entra", async () => {
    /* Las ediciones que la ponen en rojo: pedirlas en cada vuelta (se paga dos veces), o sumar una sugerida de una tarea
       que otro cambio ya toca (dos cambios con la misma clave). */
    db.projectTimeline.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    let llamadas = 0;
    const r = await fusionar(REGENERAR, {
      ubicarHechas: async () => {
        llamadas++;
        return [SUGERIDA];
      },
    });
    expect(r.estado).toBe("listas");
    expect(llamadas).toBe(1);
    expect(cambiosEscritos(1).at(-1)).toEqual(SUGERIDA);
    db.projectTimeline.updateMany.mockReset();
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    await fusionar(REGENERAR, {});
    const otra = [...tareasTocadas(cambiosEscritos())][0];
    expect(otra, "el escenario no tiene una tarea que ya cambie").toBeTruthy();
    db.projectTimeline.updateMany.mockClear();
    await fusionar(REGENERAR, { ubicarHechas: async () => [{ ...SUGERIDA, clave: `tarea:${otra}:cambia`, tareaId: otra }] });
    const claves = cambiosEscritos().map((c) => c.clave);
    expect(new Set(claves).size, "dos cambios con la misma clave").toBe(claves.length);
    expect(cambiosEscritos().filter((c) => c.tipo === "tarea-cambia" && c.sugerida)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── M2 · los hitos en la vuelta de la fusión y en lo que lee el modelo ───────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * M2 P2c-P2d (spec del replanteo §3.4-§3.5, 2026-09-27). Las reglas de los hitos (R14, R15) viven en
 * tareas-del-detalle.ts y se prueban ahí; esto prueba que las DOS fusiones se las pasan con el dato real del proyecto (el
 * tag `recurrente` y el pipeline) y que el modelo lee los mismos hitos. Con la base FALSA: la función real corre contra
 * esto. Reemplaza a la «guarda de llamadores» del borrador de la spec, que solo buscaba el texto `hitos:`.
 */
describe("M2 · los hitos: la fusión los recibe del proyecto y el modelo los lee", () => {
  const DESARROLLO = pipelineByKey("development").hubspotPipelineId;
  const CUSTOMER_SUCCESS = pipelineByKey("customer-success").hubspotPipelineId;
  const sesion = (id: string, title: string, weekIndex: number, extra: Record<string, unknown> = {}) =>
    tareaDB(id, title, weekIndex, { type: "SESSION", ...extra });
  /** Un proyecto sin kickoff: la Semana 0 no empezó (nada hecho ni en curso) y «Diseño» tiene lo suyo. */
  const SIN_KICKOFF = [
    faseDB("s0", "Semana 0", 0, 2, "PENDING", [tareaDB("s1", "Recolección de accesos", 0), tareaDB("s2", "Entrega del plan de trabajo", 1)]),
    faseDB("d", "Diseño", 1, 2, "PENDING", [tareaDB("d1", "Mapear procesos", 0)]),
  ];
  /** El mismo, con el kickoff HECHO en la Semana 0. */
  const CON_KICKOFF = [
    faseDB("s0", "Semana 0", 0, 2, "IN_PROGRESS", [
      sesion("k1", "Sesión de kickoff: equipo, roles y accesos", 0, { status: "DONE" }),
      tareaDB("s1", "Recolección de accesos", 0),
      tareaDB("s2", "Entrega del plan de trabajo", 1),
    ]),
    faseDB("d", "Diseño", 1, 2, "PENDING", [tareaDB("d1", "Mapear procesos", 0)]),
  ];
  const tarea = (title: string, weekIndex: number, type = "TASK") => ({ title, weekIndex, notes: null, porValidar: false, party: "SMARTEAM", type });
  /** La IA repite todo y suma UNA en «Diseño» (así la fusión escribe también sin el kickoff del sistema). */
  const SALIDA = {
    timelineDetail: {
      phases: [
        { id: "s0", tasks: [tarea("Recolección de accesos", 0), tarea("Entrega del plan de trabajo", 1)] },
        { id: "d", tasks: [tarea("Mapear procesos", 0), tarea("Configurar integraciones", 1)] },
      ],
    },
  };
  const conProyecto = (guardado: unknown, fases: unknown[], project: Record<string, unknown>) =>
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify(guardado)),
      pendingProposalRunId: "run-2",
      anchorStartDate: null,
      closeDateOverride: null,
      project,
      phases: fases,
    }));
  async function fusionar(corrida: string, analysisJson: unknown) {
    const sobre = await estructuraParaElDetalle("tl", corrida);
    let k = 0;
    return fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida,
      estructura: sobre!.estructura,
      analysisJson,
      huellas: null,
      cortado: false,
      nuevaClave: () => `k-${++k}`,
    });
  }
  const escrito = () => db.projectTimeline.updateMany.mock.calls.at(-1)![0].data.pendingProposal as Record<string, unknown>;
  const delSistema = () => (escrito().cambios as Cambio[]).filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && !!c.delSistema);

  it("⭐ la vuelta de la fusión: un Customer Success sin kickoff y con la Semana 0 sin empezar lo recibe del sistema; un Desarrollo, no", async () => {
    /* Las ediciones que la ponen en rojo: pasar `hitos: null` (o no pasarlo) a `cambiosDeTareasDelDetalle` en la fusión, o
       calcular `conSemanaCero` al revés (el Desarrollo, que no tiene Semana 0, recibiría un kickoff en su primera fase de
       trabajo real). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const REGENERAR = borradorVacio({ pedido: "regenerar", corrida: "run-2" });

    conProyecto(REGENERAR, SIN_KICKOFF, { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS });
    expect((await fusionar("run-2", SALIDA)).estado).toBe("listas");
    const kickoffs = delSistema();
    expect(kickoffs.map((c) => [c.fase, c.tarea.title, c.tarea.weekIndex, c.tarea.type, c.tarea.hito, c.delSistema]), "el sistema no agregó el kickoff").toEqual([
      ["s0", "Sesión de kickoff del proyecto", 0, "SESSION", ["kickoff"], "hito"],
    ]);
    // Guardado y leído, sigue siendo del sistema y con su hito (aplicar escribe la marca con eso).
    const leido = leerBorrador(JSON.parse(JSON.stringify(escrito())))!;
    expect(leido.cambios.filter((c) => c.tipo === "tarea-nueva" && c.delSistema && c.tarea.hito?.includes("kickoff"))).toHaveLength(1);

    // Sin pipeline (legacy) es Customer Success: la conducta histórica, con Semana 0.
    conProyecto(REGENERAR, SIN_KICKOFF, { tags: [], hubspotPipelineId: null });
    await fusionar("run-2", SALIDA);
    expect(delSistema(), "un proyecto sin pipeline no recibió el kickoff").toHaveLength(1);

    conProyecto(REGENERAR, SIN_KICKOFF, { tags: [], hubspotPipelineId: DESARROLLO });
    expect((await fusionar("run-2", SALIDA)).estado).toBe("listas");
    expect(delSistema(), "un Desarrollo recibió un kickoff del sistema").toEqual([]);
    expect(escrito().observaciones as string[], "en un Desarrollo no se dice que falta").not.toContain(
      "El cronograma no tiene sesión de kickoff: si ya se hizo, agrégala como hecha.",
    );
    expect((escrito().cambios as Cambio[]).map((c) => (c.tipo === "tarea-nueva" ? c.tarea.title : c.clave))).toEqual(["Configurar integraciones"]);
  });

  it("⭐ la vuelta de la fusión: un kickoff que la IA vuelve a proponer no entra, y se dice", async () => {
    /* La edición que la pone en rojo: no pasarle los hitos a la fusión (entraría un segundo kickoff). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    conProyecto(borradorVacio({ pedido: "regenerar", corrida: "run-2" }), CON_KICKOFF, { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS });
    const conOtroKickoff = {
      timelineDetail: {
        phases: [
          { id: "s0", tasks: [tarea("Recolección de accesos", 0), tarea("Entrega del plan de trabajo", 1), tarea("Sesión de kick-off con el equipo Cliente", 1, "SESSION")] },
          { id: "d", tasks: [tarea("Mapear procesos", 0), tarea("Configurar integraciones", 1)] },
        ],
      },
    };
    await fusionar("run-2", conOtroKickoff);
    const titulos = (escrito().cambios as Cambio[]).flatMap((c) => (c.tipo === "tarea-nueva" ? [c.tarea.title] : []));
    expect(titulos, "entró un segundo kickoff").toEqual(["Configurar integraciones"]);
    expect(escrito().observaciones).toContain(
      "La IA volvió a proponer el kickoff: no se suma, ya está «Sesión de kickoff: equipo, roles y accesos» (hecho).",
    );
  });

  it("⭐ el dato: un kickoff RENOMBRADO se reconoce por su marca `hito:kickoff` (se lee de la base y llega al paso 2)", async () => {
    /* Las ediciones que la ponen en rojo: no leer `originFingerprint` en `SELECT_DE_TAREA_DEL_DETALLE`, o no llevarlo a
       `TareaDelVivo.marca` en `vivoDeLaBase` (el kickoff renombrado no se reconocería: el sistema agregaría otro y el de
       la IA entraría). */
    expect(SELECT_DE_FASES_CON_TAREAS.select.tasks.select.originFingerprint, "el paso 2 no lee la marca").toBe(true);
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const RENOMBRADO = [
      faseDB("s0", "Semana 0", 0, 2, "IN_PROGRESS", [
        tareaDB("k1", "Reunión inicial con el equipo", 0, { status: "DONE", originFingerprint: "hito:kickoff" }),
        tareaDB("s1", "Recolección de accesos", 0),
      ]),
      faseDB("d", "Diseño", 1, 2, "PENDING", [tareaDB("d1", "Mapear procesos", 0)]),
    ];
    conProyecto(borradorVacio({ pedido: "regenerar", corrida: "run-2" }), RENOMBRADO, { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS });
    expect((await estructuraParaElDetalle("tl", "run-2"))?.loQueYaHay?.hitos?.kickoff).toEqual([
      { titulo: "Reunión inicial con el equipo", estado: "hecho" },
    ]);
    await fusionar("run-2", {
      timelineDetail: {
        phases: [
          { id: "s0", tasks: [tarea("Recolección de accesos", 0), tarea("Sesión de kickoff del proyecto", 0, "SESSION")] },
          { id: "d", tasks: [tarea("Mapear procesos", 0), tarea("Configurar integraciones", 1)] },
        ],
      },
    });
    const titulos = (escrito().cambios as Cambio[]).flatMap((c) => (c.tipo === "tarea-nueva" ? [c.tarea.title] : []));
    expect(titulos, "no reconoció el kickoff renombrado").toEqual(["Configurar integraciones"]);
    expect(vivoDeLaBase(null, RENOMBRADO as unknown as Parameters<typeof vivoDeLaBase>[1]).fases[0].tareas![0].marca).toBe("hito:kickoff");
    expect(vivoDeLaBase(null, RENOMBRADO as unknown as Parameters<typeof vivoDeLaBase>[1]).fases[0].tareas![1], "inventó una marca").not.toHaveProperty("marca");
  });

  it("⭐ el recálculo también los recibe: un kickoff nuevo en la fase que se recalcula no entra", async () => {
    /* La edición que la pone en rojo: no pasarle `hitos` a `cambiosDeTareasDelDetalle` en `fusionarRecalculoEnElBorrador`. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    conProyecto(
      {
        ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }),
        tareas: { corrida: "run-2", listas: true },
        recalculo: { corrida: "run-r", fases: [{ id: "d", nombre: "Diseño" }], sin: [] },
      },
      CON_KICKOFF,
      { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS },
    );
    const r = await fusionar("run-r", {
      timelineDetail: {
        phases: [{ id: "d", tasks: [tarea("Mapear procesos", 0), tarea("Sesión de kickoff del proyecto", 1, "SESSION"), tarea("Configurar integraciones", 1)] }],
      },
    });
    expect(r).toEqual({ estado: "recalculadas", escritas: ["d"], fallidas: [] });
    const titulos = (escrito().cambios as Cambio[]).flatMap((c) => (c.tipo === "tarea-nueva" ? [c.tarea.title] : []));
    expect(titulos, "el recálculo dejó entrar un segundo kickoff").toEqual(["Configurar integraciones"]);
  });

  it("⭐ lo que lee el modelo: los hitos que ya están, y el kickoff que falta con la MISMA condición del sistema", async () => {
    /* Las ediciones que la ponen en rojo: no armar `hitos` en `loQueYaHayDe`; pedir el kickoff en un Desarrollo, con la
       Semana 0 empezada o fuera del alcance (el modelo lo pondría y el sistema no, o al revés). */
    const hitosDe = async (guardado: unknown, fases: unknown[], project: Record<string, unknown>, corrida = "run-2") => {
      conProyecto(guardado, fases, project);
      return (await estructuraParaElDetalle("tl", corrida))?.loQueYaHay?.hitos;
    };
    const REGENERAR = borradorVacio({ pedido: "regenerar", corrida: "run-2" });
    const cs = { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS };

    expect(await hitosDe(REGENERAR, CON_KICKOFF, cs)).toEqual({
      kickoff: [{ titulo: "Sesión de kickoff: equipo, roles y accesos", estado: "hecho" }],
      cierre: [],
      entrega: [],
      recurrente: false,
      faltaKickoff: false,
    });
    expect((await hitosDe(REGENERAR, SIN_KICKOFF, cs))?.faltaKickoff, "falta el kickoff y no se pide").toBe(true);
    expect((await hitosDe(REGENERAR, SIN_KICKOFF, { tags: [], hubspotPipelineId: DESARROLLO }))?.faltaKickoff, "se pide en un Desarrollo").toBe(false);
    const empezada = [{ ...SIN_KICKOFF[0], tasks: [tareaDB("s1", "Recolección de accesos", 0, { status: "DONE" })] }, SIN_KICKOFF[1]];
    expect((await hitosDe(REGENERAR, empezada, cs))?.faltaKickoff, "se pide con la Semana 0 empezada").toBe(false);
    const soloDiseno = borradorVacio({ pedido: "regenerar", corrida: "run-2", soloFase: "d" });
    expect((await hitosDe(soloDiseno, SIN_KICKOFF, cs))?.faltaKickoff, "se pide fuera del alcance").toBe(false);
    // Un recurrente: la entrega por ciclo, con el tag.
    const conCiclos = [
      ...CON_KICKOFF,
      faseDB("c1", "Cierre ciclo 1", 2, 1, "DONE", [sesion("e1", "Sesión de entrega del ciclo 1", 0, { status: "DONE" })]),
      faseDB("f2", "Fase 2", 3, 2, "PENDING", []),
      faseDB("c2", "Cierre ciclo 2", 4, 1, "PENDING", [sesion("e2", "Sesión de entrega del ciclo 2", 0)]),
    ];
    const recurrente = await hitosDe(REGENERAR, conCiclos, { tags: ["recurrente"], hubspotPipelineId: CUSTOMER_SUCCESS });
    expect(recurrente?.recurrente).toBe(true);
    expect(recurrente?.entrega).toEqual([
      { titulo: "Sesión de entrega del ciclo 1", estado: "hecho" },
      { titulo: "Sesión de entrega del ciclo 2", estado: "pendiente" },
    ]);
  });

  it("⭐ lo que lee el modelo: lo que se queda aunque la IA no lo repita (en curso, suspendido, a mano) y las hechas de más", async () => {
    /* La edición que la pone en rojo: no llenar `seQuedan` (el modelo no veía lo que está en curso y lo volvía a proponer
       con otras palabras) o no contar las hechas que no entran. */
    enLaBase(borradorVacio({ pedido: "regenerar", corrida: "run-2" }));
    const diseno = (await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!.fases.find((f) => f.id === "b")!;
    expect(diseno.seQuedan).toEqual([
      { titulo: "Revisar con el cliente", porque: "a mano" },
      { titulo: "Armar reportes", porque: "en curso" },
    ]);
    expect(diseno.hechasDeMas).toBeUndefined();

    const muchas = Array.from({ length: 17 }, (_, k) => tareaDB(`h${k}`, `Hecha ${k}`, 0, { status: "DONE" }));
    conProyecto(borradorVacio({ pedido: "regenerar", corrida: "run-2" }), [
      faseDB("s0", "Semana 0", 0, 2, "IN_PROGRESS", [...muchas, tareaDB("p1", "Pausada", 1, { status: "SUSPENDED" })]),
    ], { tags: [] });
    const s0 = (await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!.fases[0];
    expect(s0.hechas).toHaveLength(15);
    expect(s0.hechasDeMas).toBe(2);
    expect(s0.seQuedan).toEqual([{ titulo: "Pausada", porque: "suspendida" }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── M2 P2f · la medición lee lo que escribe la fusión ────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * M2 P2f (spec del replanteo §3.7, 2026-09-27): `scripts/medir-propuesta.ts` dice PASA / NO PASA sobre la propuesta
 * abierta de Wherex después de cada «Regenerar todo» de la medición. Acá, un Wherex en chico pasa por la fusión REAL
 * (con la base falsa) y la medición lee lo que la fusión escribió: las 4 pasan. Después se rompe la propuesta a mano, una
 * falla por condición, y cada una tiene que dar NO PASA: si no, el script diría «pasa» sobre una propuesta mala.
 */
describe("M2 P2f · la medición lee lo que escribe la fusión", () => {
  const CUSTOMER_SUCCESS = pipelineByKey("customer-success").hubspotPipelineId;
  /** El `hoy` fijo de las guardas (spec §0.2). */
  const HOY = new Date("2026-09-26T12:00:00-06:00");
  /** La Semana 0 (S0–S1) ya pasó; «Diseño» arranca en la S2 (21–27 sep), la de hoy. */
  const ANCLA = new Date("2026-09-07T00:00:00.000Z");
  const sesion = (id: string, title: string, weekIndex: number, extra: Record<string, unknown> = {}) =>
    tareaDB(id, title, weekIndex, { type: "SESSION", ...extra });
  /** Dos kickoffs hechos y uno pendiente de la IA; la entrega y el cierre, pendientes en la última fase. */
  const WHEREX = [
    faseDB("s0", "Semana 0", 0, 2, "IN_PROGRESS", [
      sesion("k1", "Sesión de kickoff: equipo, roles y accesos", 0, { status: "DONE" }),
      sesion("k2", "Sesión de kick-off formal del proyecto", 0, { status: "DONE" }),
      sesion("k3", "Sesión de kick-off del proyecto", 1),
      tareaDB("s1", "Recolección de accesos", 1, { startDateOverride: new Date("2026-09-15T00:00:00.000Z") }),
    ]),
    faseDB("d", "Diseño", 1, 3, "PENDING", [
      tareaDB("d1", "Mapear procesos", 0),
      tareaDB("d2", "Taller con el cliente", 0, { source: "HUMAN" }),
      tareaDB("d3", "Revisar con el sponsor", 2),
    ]),
    faseDB("c", "Cierre y entrega", 2, 1, "PENDING", [
      sesion("e1", "Entrega formal del proyecto a Cliente", 0),
      sesion("c1", "Sesión de cierre con junta directiva", 0),
    ]),
  ];
  const tarea = (title: string, weekIndex: number, type = "TASK") => ({ title, weekIndex, notes: null, porValidar: false, party: "SMARTEAM", type });
  /** La IA: repite lo que sirve, vuelve a proponer el kickoff con otras palabras, repite «Taller con el cliente» (a mano)
   *  y propone una «Sesión de cierre y entrega»; no repite «Revisar con el sponsor» (se quita: futura). */
  const SALIDA = {
    timelineDetail: {
      phases: [
        { id: "s0", tasks: [tarea("Recolección de accesos", 1), tarea("Sesión de kick-off con el equipo Cliente", 1, "SESSION")] },
        { id: "d", tasks: [tarea("Mapear procesos", 0), tarea("Taller con el cliente", 0), tarea("Configurar integraciones", 1)] },
        { id: "c", tasks: [tarea("Sesión de cierre y entrega del proyecto", 0, "SESSION")] },
      ],
    },
  };
  const vivo = () => vivoDeLaBase(ANCLA, WHEREX as unknown as Parameters<typeof vivoDeLaBase>[1]);
  const medir = (b: Borrador, v: Vivo = vivo()) => medirM2({ vivo: v, borrador: b, recurrente: false, hoy: HOY });
  async function loQueEscribeLaFusion(): Promise<Borrador> {
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))),
      pendingProposalRunId: "run-2",
      anchorStartDate: ANCLA,
      closeDateOverride: null,
      project: { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS },
      phases: WHEREX,
    }));
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    let k = 0;
    const r = await fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-2",
      estructura: sobre!.estructura,
      analysisJson: SALIDA,
      huellas: null,
      cortado: false,
      nuevaClave: () => `k-${++k}`,
    });
    expect(r.estado).toBe("listas");
    // Como lo lee el script: el JSON guardado, por `leerBorrador`.
    return leerBorrador(JSON.parse(JSON.stringify(db.projectTimeline.updateMany.mock.calls.at(-1)![0].data.pendingProposal)))!;
  }
  const nueva = (fase: string, title: string, type: "SESSION" | "TASK", hito?: CambioTareaNueva["tarea"]["hito"]): CambioTareaNueva => ({
    tipo: "tarea-nueva",
    clave: `t:0f0f0f0f-0000-4000-a000-00000000000${fase.length}`,
    fase,
    tarea: { title, weekIndex: 0, notes: null, party: "AMBOS", type, needsValidation: false, motivoPorValidar: null, fuga: null, ...(hito ? { hito } : {}) },
  });

  it("⭐ con lo que escribe la fusión real, las 4 condiciones PASAN, con lo que se vio", async () => {
    /* Las ediciones que la ponen en rojo: que la medición no reconozca lo que escribe la fusión (otra clave, otro texto
       de la observación de R14, el `delSistema` leído de otro lado): el script diría NO PASA sobre una propuesta buena. */
    const b = await loQueEscribeLaFusion();
    expect(avisosDeLaMedicion(b)).toEqual([]);
    expect(medir(b).map((c) => [c.numero, c.pasa, c.detalle])).toEqual([
      [1, true, "Sale del sistema: «Sesión de kick-off del proyecto»."],
      [2, true, "Ninguno."],
      [3, true, "1 repite una que ya está."],
      [4, true, "1 de 1 que quita la IA."],
    ]);
    expect(renglonDeLaCondicion(medir(b)[0])).toBe(
      "1. PASA · El kickoff que sobra sale para quitar, del sistema — Sale del sistema: «Sesión de kick-off del proyecto».",
    );
  });

  it("⭐ cada falla da NO PASA en su condición: el kickoff como de la IA o sin quitar, un hito que ya estaba, 6 que repiten", async () => {
    /* Las ediciones que la ponen en rojo (en medicion-de-la-propuesta.ts): no mirar `delSistema` en la 1; mirar solo la
       marca de R15 (o solo el título) en la 2; leer el total de la observación en vez de «K repiten» en la 3. */
    const b = await loQueEscribeLaFusion();
    const conCambios = (cambios: Cambio[]): Borrador => ({ ...b, cambios });
    const esElSobrante = (c: Cambio) => c.tipo === "tarea-se-va" && c.tareaId === "k3";
    expect(medir(conCambios(b.cambios.map((c) => (esElSobrante(c) ? { ...c, delSistema: undefined } : c))))[0]).toMatchObject({
      pasa: false,
      detalle: "«Sesión de kick-off del proyecto» sale, pero como de la IA.",
    });
    expect(medir(conCambios(b.cambios.filter((c) => !esElSobrante(c))))[0]).toMatchObject({
      pasa: false,
      detalle: "«Sesión de kick-off del proyecto» no sale.",
    });
    // Un kickoff que entró sin la marca de R15 (lo reconoce el título) y una entrega con la marca y un título que no.
    const porTitulo = medir(conCambios([...b.cambios, nueva("s0", "Sesión de kick-off con el equipo Cliente", "SESSION")]))[1];
    expect(porTitulo.pasa).toBe(false);
    expect(porTitulo.detalle).toBe("Entran igual: «Sesión de kick-off con el equipo Cliente» (kickoff; ya está «Sesión de kickoff: equipo, roles y accesos»).");
    const porMarca = medir(conCambios([...b.cambios, nueva("d", "Revisión final", "TASK", ["entrega"])]))[1];
    expect(porMarca).toMatchObject({ pasa: false, detalle: "Entran igual: «Revisión final» (entrega; ya está «Entrega formal del proyecto a Cliente»)." });
    // Lo que dictó el chat no cuenta: lo pidió una persona.
    expect(medir(conCambios([...b.cambios, { ...nueva("s0", "Sesión de kick-off con el equipo Cliente", "SESSION"), porChat: true }]))[1].pasa).toBe(true);
    const seis = observacionDeLasQueNoEntran({ repiten: 6, enElPasado: 3 })!;
    expect(medir({ ...b, observaciones: [...b.observaciones.filter((o) => !o.startsWith("No entra")), seis] })[2]).toMatchObject({
      pasa: false,
      detalle: "6 repiten una que ya está.",
    });
  });

  it("⭐ la 4 cuenta solo las pendientes de semanas que no pasaron, sin las del sistema: 8 futuras NO PASA", () => {
    /* Las ediciones que la ponen en rojo: contar todas las que se quitan (sin `semanaVencida`), o contar la del sistema. */
    const muchas = Array.from({ length: 9 }, (_, k) => tareaDB(`p${k}`, `Pendiente ${k}`, 2));
    const fases = [WHEREX[0], { ...WHEREX[1], tasks: [...WHEREX[1].tasks, ...muchas] }, WHEREX[2]];
    const v = vivoDeLaBase(ANCLA, fases as unknown as Parameters<typeof vivoDeLaBase>[1]);
    const seVa = (id: string, faseId: string, extra: Partial<Extract<Cambio, { tipo: "tarea-se-va" }>> = {}): Cambio => {
      const t = v.fases.flatMap((f) => f.tareas ?? []).find((x) => x.id === id)!;
      return { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(id), tareaId: id, faseId, desde: fotoDeTarea(t), ...extra };
    };
    const base = borradorVacio({ pedido: "regenerar", corrida: "run-2" });
    const ocho = muchas.slice(0, 8).map((t) => seVa(t.id, "d"));
    // «Recolección de accesos» (S1, ya pasó) no cuenta; el kickoff que quita el sistema, tampoco.
    const conOcho: Borrador = { ...base, tareas: { corrida: "run-2", listas: true }, cambios: [...ocho, seVa("s1", "s0"), seVa("k3", "s0", { delSistema: "hito" })] };
    expect(medir(conOcho, v)[3]).toMatchObject({ pasa: false });
    expect(medir(conOcho, v)[3].detalle).toMatch(/^8 de 9 que quita la IA\. «Pendiente 0», /);
    const conSiete: Borrador = { ...conOcho, cambios: conOcho.cambios.slice(1) };
    expect(medir(conSiete, v)[3]).toMatchObject({ pasa: true, detalle: "7 de 8 que quita la IA." });
    // Sin fecha de arranque nada venció: todas cuentan como futuras, y se dice.
    expect(medir(conSiete, { ...v, ancla: null })[3]).toMatchObject({ pasa: false, detalle: expect.stringContaining("Sin fecha de arranque") });
  });

  it("⭐ las piezas: «K repiten» de la observación real, los avisos y el vivo del script igual al de la fusión", () => {
    /* Las ediciones que la ponen en rojo: leer mal la observación de R14; no avisar que no es «Regenerar todo»; o armar
       el vivo del script distinto del de `vivoDeLaBase` (sin la marca, con otra fecha). */
    expect(repitenDeLasObservaciones([observacionDeLasQueNoEntran({ repiten: 1 })!])).toBe(1);
    expect(repitenDeLasObservaciones([observacionDeLasQueNoEntran({ repiten: 4 })!])).toBe(4);
    expect(repitenDeLasObservaciones(["otra", observacionDeLasQueNoEntran({ repiten: 2, enElPasado: 5 })!])).toBe(2);
    expect(repitenDeLasObservaciones([observacionDeLasQueNoEntran({ repiten: 0, enElPasado: 3 })!])).toBe(0);
    expect(repitenDeLasObservaciones([])).toBe(0);
    expect(avisosDeLaMedicion(borradorVacio({ pedido: "regenerar", corrida: "r", soloFase: "d" }))).toEqual([
      "No es «Regenerar todo»: la medición es para esa propuesta.",
      "Las tareas de la IA todavía no llegaron: mide cuando lleguen.",
    ]);
    // El vivo del script (SQL) y el de la fusión (Prisma), iguales: con la marca, las fechas fijadas y el ancla.
    const tareasDeS0 = WHEREX[0].tasks as Array<ReturnType<typeof tareaDB>>;
    const conMarca = [{ ...WHEREX[0], tasks: tareasDeS0.map((t) => (t.id === "k1" ? { ...t, originFingerprint: "hito:kickoff" } : t)) }, ...WHEREX.slice(1)];
    const dia = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
    const filasDeFase: FilaDeFase[] = conMarca.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      status: f.status,
    }));
    const filasDeTarea: FilaDeTarea[] = conMarca.flatMap((f) =>
      f.tasks.map((t) => {
        const x = t as ReturnType<typeof tareaDB> & { originFingerprint?: string | null; startDateOverride: unknown; dueDateOverride: unknown };
        return {
          id: x.id,
          phaseId: f.id,
          title: x.title,
          weekIndex: x.weekIndex,
          notes: x.notes,
          party: x.party,
          type: x.type,
          status: x.status,
          source: x.source,
          needsValidation: x.needsValidation,
          originFingerprint: x.originFingerprint ?? null,
          inicioFijado: dia(x.startDateOverride),
          finFijado: dia(x.dueDateOverride),
        };
      }),
    );
    const delScript = vivoDeLasFilas(ANCLA.toISOString(), filasDeFase, filasDeTarea);
    expect(delScript).toEqual(vivoDeLaBase(ANCLA, conMarca as unknown as Parameters<typeof vivoDeLaBase>[1]));
    expect(delScript.fases[0].tareas![0].marca).toBe("hito:kickoff");
    expect(delScript.fases[0].tareas![3].inicioFijado).toBe("2026-09-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── M3 · el reloj de la propuesta y lo que ya pasó, del lado del servidor ─────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * M3 (spec del replanteo §4, 2026-09-27; decisión (a) de Elías: lo que ya pasó no se reescribe). `marcarTareasEnCurso`
 * guarda EL RELOJ (`hoy`) solo en «Regenerar todo» y con fecha de arranque; lo que lee el modelo saca lo vencido de
 * «pendiente» y dice desde qué semana se puede proponer; y la fusión real le pasa `pasado` a la regla (R13).
 */
describe("M3 · el reloj de la propuesta y lo que ya pasó", () => {
  const CUSTOMER_SUCCESS = pipelineByKey("customer-success").hubspotPipelineId;
  /** El `hoy` fijo de las guardas (spec §0.2) y el arranque de Wherex: hoy es la S18. */
  const HOY = new Date("2026-09-26T12:00:00-06:00");
  const ANCLA = new Date("2026-05-19T00:00:00.000Z");
  const RELOJ = { instante: HOY.toISOString(), semana: 18, politica: POLITICA_DE_ATRASOS };
  /** «Semana 0» (S0–S1, ya pasó) con el kickoff hecho y dos pendientes; «Diseño» (S2–S21): vencieron sus weekIndex 0 a 15. */
  const FASES_M3 = [
    faseDB("s0", "Semana 0", 0, 2, "IN_PROGRESS", [
      tareaDB("k1", "Sesión de kickoff: equipo, roles y accesos", 0, { status: "DONE", type: "SESSION" }),
      tareaDB("s2", "Confirmar el sponsor", 0, { source: "HUMAN" }),
      tareaDB("s1", "Recolección de accesos", 1),
    ]),
    faseDB("d", "Diseño", 1, 20, "IN_PROGRESS", [
      tareaDB("d0", "Mapear procesos", 0, { status: "DONE" }),
      tareaDB("d1", "Definir pipeline", 3),
      tareaDB("d2", "Configurar integraciones", 17),
    ]),
  ];
  const enLaBaseConFecha = (guardado: unknown, fases: unknown[] = FASES_M3, ancla: Date | null = ANCLA) =>
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify(guardado)),
      pendingProposalRunId: "run-1",
      anchorStartDate: ancla,
      closeDateOverride: null,
      project: { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS },
      phases: fases,
    }));
  const escrito = () => db.projectTimeline.updateMany.mock.calls.at(-1)![0].data.pendingProposal as Record<string, unknown>;

  it("⭐ el reloj: la marca lo escribe en «Regenerar todo» (el vacío y el token) con la política; con una fase, «primera» o sin fecha, no", async () => {
    /* La edición que la pone en rojo: escribirlo en «Regenerar» de una fase (ahí «lo que ya se hizo va como tarea» manda,
       D3), o en «Generar cronograma» (vaciaría la Semana 0 de un proyecto nuevo). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    const marcar = (pedido: { token: string | null; version: number | null }, soloFase: string | null = null) =>
      marcarTareasEnCurso({ timelineId: "tl", pedido, corrida: "run-t", soloFase, ahora: HOY });

    // El vacío de «Regenerar todo»: hay tareas de la IA y fecha de arranque.
    db.timelineTask.findMany.mockResolvedValue([{ source: "HUMAN" }, { source: "AGENT" }]);
    /* 2026-09-27, M4 P4b: la marca del vacío ya no lee solo la fecha de arranque: lee el cronograma entero (las fases con
       sus tareas y el pipeline) para reprogramar lo atrasado en la misma escritura. FASES_M3 está al día (nada que
       reprogramar): lo que se mira acá sigue siendo el reloj. */
    db.projectTimeline.findUnique.mockResolvedValue({ anchorStartDate: ANCLA, phases: FASES_M3, project: { hubspotPipelineId: CUSTOMER_SUCCESS } });
    expect(await marcar({ token: null, version: null })).toBeNull();
    expect(escrito().hoy, "el vacío de «Regenerar todo» sin reloj").toEqual(RELOJ);
    expect(leerBorrador(JSON.parse(JSON.stringify(escrito())))?.hoy, "el reloj guardado no se lee").toEqual(RELOJ);
    // «Regenerar» de una fase, «primera» y sin fecha de arranque: sin reloj.
    await marcar({ token: null, version: null }, "d");
    expect(escrito(), "«Regenerar» de una fase con reloj").not.toHaveProperty("hoy");
    expect(escrito().soloFase).toBe("d");
    db.timelineTask.findMany.mockResolvedValue([{ source: "HUMAN" }]);
    await marcar({ token: null, version: null });
    expect(escrito().pedido).toBe("primera");
    expect(escrito(), "«Generar cronograma» con reloj").not.toHaveProperty("hoy");
    db.timelineTask.findMany.mockResolvedValue([{ source: "AGENT" }]);
    db.projectTimeline.findUnique.mockResolvedValue({ anchorStartDate: null });
    await marcar({ token: null, version: null });
    expect(escrito(), "sin fecha de arranque con reloj").not.toHaveProperty("hoy");

    // El token (el borrador del paso 1): el reloj de ESTA marca; uno viejo (otra semana) se reemplaza.
    const delPaso1 = { ...borradorVacio({ pedido: "regenerar", corrida: "run-1" }), version: 3, tareas: { corrida: null, listas: false } };
    const viejo = { instante: "2026-09-18T15:00:00.000Z", semana: 17, politica: POLITICA_DE_ATRASOS };
    enLaBaseConFecha({ ...delPaso1, hoy: viejo });
    expect(await marcar({ token: "run-1", version: 3 })).toBeNull();
    expect(escrito().hoy, "el token sin el reloj de esta marca").toEqual(RELOJ);
    expect(escrito().version).toBe(4);
    // Con `soloFase` guardado, sin reloj (y el viejo se quita); sin fecha de arranque, tampoco.
    enLaBaseConFecha({ ...delPaso1, soloFase: "d", hoy: viejo });
    await marcar({ token: "run-1", version: 3 });
    expect(escrito(), "«Regenerar» de una fase con reloj").not.toHaveProperty("hoy");
    enLaBaseConFecha(delPaso1, FASES_M3, null);
    await marcar({ token: "run-1", version: 3 });
    expect(escrito()).not.toHaveProperty("hoy");
  });

  it("⭐ leerBorrador lee el reloj solo bien formado; si no, lo ignora sin invalidar la propuesta ni sumar desconocidos", () => {
    /* La edición que la pone en rojo: aceptar una política que esta versión no conoce (un valor de M5 leído por M3), o
       tirar la propuesta entera por un reloj mal formado. */
    const base = borradorVacio({ pedido: "regenerar", corrida: "run-2" });
    expect(leerBorrador({ ...base, hoy: RELOJ })?.hoy).toEqual(RELOJ);
    for (const malo of [
      { ...RELOJ, instante: "ayer" },
      { ...RELOJ, semana: -1 },
      { ...RELOJ, semana: 1.5 },
      { ...RELOJ, politica: { ...POLITICA_DE_ATRASOS, fasesVencidas: "otra" } },
      { ...RELOJ, politica: { ...POLITICA_DE_ATRASOS, pendientesDelPasado: "traer-a-mañana" } },
      { ...RELOJ, politica: { ...POLITICA_DE_ATRASOS, casiTerminada: { maxAbiertas: 2, minHecho: 7 } } },
      { instante: RELOJ.instante, semana: 18 },
      "2026-09-26",
    ]) {
      const leido = leerBorrador({ ...base, hoy: malo });
      expect(leido, JSON.stringify(malo)).not.toBeNull();
      expect(leido, JSON.stringify(malo)).not.toHaveProperty("hoy");
      expect(leido?.desconocidos).toBeUndefined();
    }
  });

  it("⭐ lo que lee el modelo con el reloj: lo vencido sale de «pendiente» (va a «se queda») y el bloque «LO QUE YA PASÓ»", async () => {
    /* La edición que la pone en rojo: dejar lo vencido en `pendientes`: el modelo recibía «repite su título EXACTO y su
       weekIndex» y «no repitas lo pendiente de esas semanas» a la vez, y R13 y R14 le tiraban la repetición. */
    enLaBaseConFecha({ ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }), hoy: RELOJ });
    const l = (await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!;
    const [s0, diseno] = l.fases;
    expect(s0.pendientes, "lo vencido sigue en «pendiente»").toEqual([]);
    expect(s0.seQuedan).toEqual([
      { titulo: "Confirmar el sponsor", porque: "a mano" },
      { titulo: "Recolección de accesos", porque: QUEDO_SIN_HACER },
    ]);
    expect(diseno.pendientes).toEqual([{ titulo: "Configurar integraciones", semana: 17 }]);
    expect(diseno.seQuedan).toEqual([{ titulo: "Definir pipeline", porque: QUEDO_SIN_HACER }]);
    expect(l.pasado).toEqual({
      semanaDeHoy: 18,
      porFase: [
        { id: "s0", desde: 2, entera: true },
        { id: "d", desde: 16, entera: false },
      ],
    });
    const texto = renderLoQueYaHay(l);
    expect(texto).toContain(`«Definir pipeline» (${QUEDO_SIN_HACER})`);
    expect(texto, "lo vencido sigue con su weekIndex").not.toContain("«Definir pipeline» (weekIndex");
    expect(texto).toContain(
      `${TITULO_DE_LO_QUE_YA_PASO}\nHoy es la semana 18 del proyecto (contando desde 0). Lo que cae en semanas que ya pasaron no se reescribe: no pongas tareas ahí y no repitas lo pendiente de esas semanas.\n[s0] «Semana 0» — ya pasó entera: inclúyela con "tasks": [].\n[d] «Diseño» — solo weekIndex desde 16.`,
    );

    // Sin reloj (un borrador de antes) o con alcance («Regenerar» de una fase): como siempre.
    enLaBaseConFecha(borradorVacio({ pedido: "regenerar", corrida: "run-2" }));
    const sinReloj = (await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!;
    expect(sinReloj.pasado).toBeUndefined();
    expect(sinReloj.fases[1].pendientes.map((p) => p.titulo)).toEqual(["Definir pipeline", "Configurar integraciones"]);
    enLaBaseConFecha({ ...borradorVacio({ pedido: "regenerar", corrida: "run-2", soloFase: "d" }), hoy: RELOJ });
    const conAlcance = (await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!;
    expect(conAlcance.pasado, "lo que ya pasó con alcance").toBeUndefined();
    expect(renderLoQueYaHay(conAlcance)).not.toContain(TITULO_DE_LO_QUE_YA_PASO);

    // El kickoff que falta: con el reloj, la Semana 0 que ya pasó no lo pide (la misma condición que la fusión).
    const sinKickoff = [{ ...FASES_M3[0], status: "PENDING", tasks: FASES_M3[0].tasks.filter((t) => (t as { id: string }).id !== "k1") }, FASES_M3[1]];
    enLaBaseConFecha(borradorVacio({ pedido: "regenerar", corrida: "run-2" }), sinKickoff);
    expect((await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!.hitos!.faltaKickoff, "sin reloj, M2 lo pide").toBe(true);
    enLaBaseConFecha({ ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }), hoy: RELOJ }, sinKickoff);
    expect((await estructuraParaElDetalle("tl", "run-2"))!.loQueYaHay!.hitos!.faltaKickoff, "pide un kickoff en el pasado").toBe(false);
  });

  it("⭐ la fusión real con el reloj: nada nuevo en una semana vencida y lo pendiente de ahí se queda; el reloj sigue guardado", async () => {
    /* La edición que la pone en rojo: no pasarle `pasado` a `cambiosDeTareasDelDetalle` en la fusión de «Regenerar todo»:
       «Definir pipeline» (S5) se iba y «Relevar el proceso» entraba en la S4. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    enLaBaseConFecha({ ...borradorVacio({ pedido: "regenerar", corrida: "run-2" }), hoy: RELOJ });
    const sobre = await estructuraParaElDetalle("tl", "run-2");
    const t = (title: string, weekIndex: number) => ({ title, weekIndex, notes: null, porValidar: false, party: "SMARTEAM", type: "TASK" });
    let k = 0;
    const r = await fusionarDetalleEnElBorrador({
      timelineId: "tl",
      corrida: "run-2",
      estructura: sobre!.estructura,
      analysisJson: {
        timelineDetail: {
          phases: [
            { id: "s0", tasks: [] },
            { id: "d", tasks: [t("Relevar el proceso", 2), t("Configurar integraciones", 17), t("Documentar decisiones", 18)] },
          ],
        },
      },
      huellas: null,
      cortado: false,
      nuevaClave: () => `k-${++k}`,
    });
    expect(r.estado).toBe("listas");
    const cambios = escrito().cambios as Cambio[];
    expect(cambios.map((c) => (c.tipo === "tarea-nueva" ? `+${c.tarea.title}@${c.tarea.weekIndex}` : `${c.tipo}:${c.clave}`))).toEqual([
      "+Documentar decisiones@18",
    ]);
    expect(escrito().observaciones).toContain("No entra 1 tarea de la IA: cae en una semana que ya pasó.");
    expect(escrito().hoy, "la fusión perdió el reloj").toEqual(RELOJ);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── M4 P4b · la marca del paso 2 reprograma lo atrasado ──────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * M4 P4b (spec del replanteo §5.3, 2026-09-27; en el orden del plan, lo que decidió Elías). `marcarTareasEnCurso` corre la
 * reprogramación (lib/timeline/reprogramar-desde-hoy.ts) en «Regenerar todo», en sus dos ramas y en la MISMA escritura que
 * el reloj: el paso 2 ve la estructura ya reprogramada. Un reintento otra semana se recalcula desde lo vivo más lo de la
 * IA, nunca encima de lo reprogramado.
 */
describe("M4 P4b · la marca del paso 2 reprograma lo atrasado", () => {
  const CUSTOMER_SUCCESS = pipelineByKey("customer-success").hubspotPipelineId;
  const HOY = new Date("2026-09-26T12:00:00-06:00"); // S18 con el arranque de Wherex
  const LA_SEMANA_QUE_VIENE = new Date("2026-10-03T12:00:00-06:00"); // S19
  const ANCLA = new Date("2026-05-19T00:00:00.000Z");
  const conInicio = (f: ReturnType<typeof faseDB>, startWeek: number) => ({ ...f, startWeek });
  /** «Diseño» (S2–S5) empezó y quedó atrasado; «Pruebas» (S6–S7) ni empezó; «Cierre» va detrás, contiguo. */
  const FASES_M4 = [
    faseDB("s0", "Semana 0", 0, 2, "DONE", [tareaDB("k1", "Sesión de kickoff", 0, { status: "DONE", type: "SESSION" })]),
    conInicio(
      faseDB("d", "Diseño", 1, 4, "IN_PROGRESS", [
        tareaDB("d0", "Mapear procesos", 0, { status: "DONE" }),
        tareaDB("d1", "Definir pipeline", 1),
        tareaDB("d2", "Armar reportes", 3),
      ]),
      2,
    ),
    conInicio(faseDB("p", "Pruebas", 2, 2, "PENDING", [tareaDB("p1", "Probar flujos", 0)]), 6),
    faseDB("c", "Cierre", 3, 1, "PENDING", [tareaDB("c1", "Sesión de cierre", 0, { type: "SESSION" })]),
  ];
  /** Lo que la IA propuso en el paso 1: «Pruebas» de 2 a 3 semanas (una sin empezar: se queda). */
  const DE_LA_IA = {
    tipo: "fase-cambia",
    clave: "fase:p:durationWeeks",
    faseId: "p",
    fase: "Pruebas",
    campo: "durationWeeks",
    desde: 2,
    a: 3,
    motivo: "Tus instrucciones piden más pruebas.",
  };
  const delPaso1 = () => ({
    ...borradorVacio({ pedido: "regenerar", corrida: "run-1" }),
    version: 3,
    tareas: { corrida: null, listas: false },
    cambios: [DE_LA_IA],
  });
  const enLaBaseM4 = (guardado: unknown) =>
    db.projectTimeline.findUnique.mockImplementation(async () => ({
      pendingProposal: JSON.parse(JSON.stringify(guardado)),
      pendingProposalRunId: "run-1",
      anchorStartDate: ANCLA,
      project: { tags: [], hubspotPipelineId: CUSTOMER_SUCCESS },
      phases: FASES_M4,
    }));
  const escrito = () =>
    JSON.parse(JSON.stringify(db.projectTimeline.updateMany.mock.calls.at(-1)![0].data.pendingProposal)) as Record<string, unknown>;
  const delSistema = (g: Record<string, unknown>) =>
    (g.cambios as Cambio[]).flatMap((c) =>
      c.tipo === "fase-cambia" && c.desdeHoy
        ? [`${c.faseId}:${c.campo}:${String(c.a)}`]
        : c.tipo === "tarea-cambia" && c.desdeHoy
          ? [`${c.tareaId}@${c.a.weekIndex}`]
          : [],
    );

  it("⭐ reintento: marcada en la S18 y otra vez en la S19, la segunda se reprograma desde la S19, sin nada de la primera", async () => {
    /* La edición que la pone en rojo: reprogramar sobre la reprogramación vieja (en el token, quitar solo el reloj y no
       `sinReprogramacion`): la estructura supuesta ya traía lo reprogramado, las claves se repetían y la IA quedaba
       reemplazada por el sistema. */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    enLaBaseM4(delPaso1());
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 3 }, corrida: "run-t", ahora: HOY })).toBeNull();
    expect(db.projectTimeline.updateMany, "el reloj y la reprogramación en dos escrituras").toHaveBeenCalledTimes(1);
    const primera = escrito();
    expect((primera.hoy as { semana: number }).semana).toBe(18);
    // «Diseño»: lo que falta arranca en la S18 ((18 − 2) + 3); «Pruebas» espera a que termine (S21).
    expect(delSistema(primera)).toEqual(["d:durationWeeks:19", "p:startWeek:21", "d1@16", "d2@18"]);
    expect(primera.version).toBe(4);

    // La corrida falla y el CSE vuelve a intentar la semana siguiente, sobre lo que quedó guardado.
    enLaBaseM4(primera);
    expect(
      await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 4 }, corrida: "run-t", ahora: LA_SEMANA_QUE_VIENE }),
    ).toBeNull();
    const segunda = escrito();
    expect((segunda.hoy as { semana: number }).semana).toBe(19);
    expect(delSistema(segunda), "la segunda se reprogramó encima de la primera").toEqual([
      "d:durationWeeks:20",
      "p:startWeek:22",
      "d1@17",
      "d2@19",
    ]);
    const claves = (segunda.cambios as Cambio[]).map((c) => c.clave);
    expect(new Set(claves).size, "claves repetidas").toBe(claves.length);
    expect((segunda.cambios as Cambio[]).filter((c) => c.clave === DE_LA_IA.clave), "lo de la IA").toEqual([DE_LA_IA]);
    // Lo mismo que una primera marca en la S19.
    enLaBaseM4(delPaso1());
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: 3 }, corrida: "run-t", ahora: LA_SEMANA_QUE_VIENE });
    expect({ ...segunda, version: 0 }).toEqual({ ...escrito(), version: 0 });
  });

  it("⭐ el vacío con lo reprogramado deja de ser «el vacío»: con la corrida fallida hay barra y el chat no queda en solo lectura", async () => {
    /* La edición que la pone en rojo: reprogramar solo en la rama del token (el vacío nacía sin cambios y, si el paso 2
       fallaba, quedaba en «vacio-fallido»: solo descartar, y lo atrasado sin reprogramar). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.timelineTask.findMany.mockResolvedValue([{ source: "AGENT" }]);
    db.projectTimeline.findUnique.mockResolvedValue({ anchorStartDate: ANCLA, phases: FASES_M4, project: { hubspotPipelineId: CUSTOMER_SUCCESS } });
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-v", ahora: HOY })).toBeNull();
    expect(db.projectTimeline.updateMany).toHaveBeenCalledTimes(1);
    const vacio = escrito();
    expect(delSistema(vacio)).toEqual(["d:durationWeeks:19", "p:startWeek:21", "d1@16", "d2@18"]);
    expect(vacio.version, "el vacío nace en la versión 0").toBe(0);
    expect((vacio.hoy as { semana: number }).semana).toBe(18);
    expect(esVacioEsperandoTareas(vacio), "sigue siendo «el vacío»").toBe(false);
    const leido = leerBorrador(vacio)!;
    expect(modoDeLaPropuesta({ hayBorrador: true, conCambios: leido.cambios.length > 0, tareas: "fallo" })).toBe("barra");
    expect(porQueDeSoloLectura({ guardado: vacio, borrador: leido, tareas: { estado: "fallo", fase: null, motivo: null } })).toBeNull();
    // D4: sin las tareas, descartar no las ofrece (se armaron para la estructura reprogramada).
    expect(traeCambiosDeFases(vacio)).toBe(true);
  });

  it("⭐ el fixture grande en la base simulada: UNA escritura con las 8 casillas, el pin, las 25 arrastradas y el reloj", async () => {
    /* La misma guarda que borrador-del-detalle.int.test.ts (M4), en memoria: la base local de :5433 no tiene hoy todas las
       columnas del esquema y la de integración no corre. La edición que la pone en rojo: escribir la reprogramación en
       otra escritura que el reloj, o no leer las fases con sus tareas. */
    const fx = leerFixtureGrande();
    const crudo = JSON.parse(JSON.stringify(fx.borrador)) as { cambios: Array<{ tipo: string }>; version: number } & Record<string, unknown>;
    const guardado = { ...crudo, cambios: crudo.cambios.filter((c) => !c.tipo.startsWith("tarea")), tareas: { corrida: "run-1", listas: false }, tareasArmadasPara: {} };
    const fases = fx.vivo.fases.map((f) => ({
      ...f,
      tasks: f.tareas.map((t) => ({ ...t, startDateOverride: null, dueDateOverride: null })),
    }));
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.projectTimeline.findUnique.mockResolvedValue({
      pendingProposal: guardado,
      pendingProposalRunId: "run-1",
      anchorStartDate: new Date(`${fx.ancla}T00:00:00.000Z`),
      project: { hubspotPipelineId: null },
      phases: fases,
    });
    const hoy = new Date(fx.hoy);
    expect(await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: "run-1", version: crudo.version }, corrida: "run-2", ahora: hoy })).toBeNull();
    expect(db.projectTimeline.updateMany, "dos escrituras").toHaveBeenCalledTimes(1);
    const g = escrito();
    expect(g.version).toBe(crudo.version + 1);
    expect(g.hoy).toEqual({ instante: hoy.toISOString(), semana: 18, politica: POLITICA_DE_ATRASOS });
    const cambios = g.cambios as Cambio[];
    const deFase = cambios.filter((c): c is Extract<Cambio, { tipo: "fase-cambia" }> => c.tipo === "fase-cambia" && !!c.desdeHoy);
    expect(deFase.filter((c) => !c.fijaInicio)).toHaveLength(8);
    expect(deFase.filter((c) => c.fijaInicio).map((c) => c.clave)).toEqual(["fase:f10:startWeek"]);
    expect(cambios.filter((c) => c.tipo === "tarea-cambia" && c.desdeHoy)).toHaveLength(25);
    expect(cambios.filter((c) => (c.tipo === "fase-cambia" && !c.desdeHoy) || c.tipo === "fase-nueva").map((c) => c.clave)).toEqual([
      "fase:f12:durationWeeks",
      "n:p01",
    ]);
  });

  it("⭐ «Regenerar» de una fase y «primera» no reprograman; en un Desarrollo la primera fase no es la Semana 0", async () => {
    /* La edición que la pone en rojo: reprogramar en «Regenerar» de una fase (lo pidió el CSE, D3), o calcular
       `conSemanaCero` sin el pipeline (la primera fase de un Desarrollo, trabajo real, quedaba quieta). */
    db.projectTimeline.updateMany.mockResolvedValue({ count: 1 });
    db.timelineTask.findMany.mockResolvedValue([{ source: "AGENT" }]);
    const base = { anchorStartDate: ANCLA, phases: FASES_M4, project: { hubspotPipelineId: CUSTOMER_SUCCESS } };
    db.projectTimeline.findUnique.mockResolvedValue(base);
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-v", soloFase: "d", ahora: HOY });
    expect(delSistema(escrito()), "«Regenerar» de una fase reprogramó").toEqual([]);
    db.timelineTask.findMany.mockResolvedValue([{ source: "HUMAN" }]);
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-v", ahora: HOY });
    expect(delSistema(escrito()), "«Generar cronograma» reprogramó").toEqual([]);
    // La primera fase sin empezar y atrasada: en un Desarrollo se reprograma; con Semana 0 (Customer Success), no.
    db.timelineTask.findMany.mockResolvedValue([{ source: "AGENT" }]);
    const primeraSinEmpezar = [
      { ...FASES_M4[0], name: "Relevamiento técnico", status: "PENDING", tasks: [tareaDB("r1", "Relevar el proceso", 1)] },
      ...FASES_M4.slice(1),
    ];
    const DESARROLLO = pipelineByKey("development").hubspotPipelineId;
    db.projectTimeline.findUnique.mockResolvedValue({ ...base, phases: primeraSinEmpezar, project: { hubspotPipelineId: DESARROLLO } });
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-v", ahora: HOY });
    expect(delSistema(escrito()), "en un Desarrollo, la primera fase quedó quieta").toContain("s0:startWeek:18");
    db.projectTimeline.findUnique.mockResolvedValue({ ...base, phases: primeraSinEmpezar });
    await marcarTareasEnCurso({ timelineId: "tl", pedido: { token: null, version: null }, corrida: "run-v", ahora: HOY });
    expect(delSistema(escrito()), "con Semana 0, la primera fase se reprogramó").not.toContain("s0:startWeek:18");
  });
});
