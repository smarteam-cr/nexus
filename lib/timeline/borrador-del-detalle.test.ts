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
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), updateMany: vi.fn() },
  agentRun: { update: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { borradorVacio, leerBorrador, planDeAplicacion, type Cambio, type CambioTareaCambia, type CambioTareaNueva, type Vivo } from "./borrador";
import {
  estructuraParaElDetalle,
  fusionarDetalleEnElBorrador,
  SELECT_DE_FASES_CON_TAREAS,
  TOPE_DE_LA_EXPLICACION_MS,
  TOPE_DE_LAS_SUGERIDAS_MS,
  vivoDeLaBase,
} from "./borrador-del-detalle";
import { pipelineByKey } from "@/lib/projects/kind";
import { tareasTocadas } from "./hechas-fuera-de-lugar";
import { explicacionEnPantalla, huellaDeLosCambios, type ExplicacionSinSello } from "./explicacion-de-la-propuesta";

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
