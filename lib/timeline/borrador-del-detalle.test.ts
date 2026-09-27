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

import { borradorVacio, type Cambio, type Vivo } from "./borrador";
import { estructuraParaElDetalle, fusionarDetalleEnElBorrador, TOPE_DE_LA_EXPLICACION_MS } from "./borrador-del-detalle";
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
