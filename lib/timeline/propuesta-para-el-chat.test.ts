/**
 * lib/timeline/propuesta-para-el-chat.test.ts — QUÉ LEE EL CHAT DE LA PROPUESTA ABIERTA, Y CUÁNDO NO
 * LA PUEDE CAMBIAR (E3 P4).
 *
 * Correr: `npx vitest run lib/timeline/propuesta-para-el-chat.test.ts --project unit`.
 *
 *   1. los cinco casos de solo lectura, cada uno con su porqué, y el editable;
 *   2. el resumen es el de la barra: con lo desmarcado que guardó el servidor y nada forzado;
 *   3. la lectura: sin propuesta no hay nada; con ella, lo vivo trae las tareas con sus notas y el
 *      estado de cada fase (la misma lectura que aplicar), y el estado de las tareas sale de su corrida.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn() },
  agentRun: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { leerPropuestaParaElChat, porQueDeSoloLectura, propuestaParaElChat } from "./propuesta-para-el-chat";
import { SELECT_DE_FASES_CON_TAREAS } from "./borrador-del-detalle";
import {
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  leerBorrador,
  resumir,
  type Borrador,
  type Cambio,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";

const tarea = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const B1 = tarea("b1", "Mapear procesos", 0, { notes: "lo que dijo el cliente" });
const B2 = tarea("b2", "Definir pipeline", 1);
const VIVO: Vivo = {
  ancla: "2026-10-05T00:00:00.000Z",
  fases: [
    { id: "a", name: "Kick-off", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null, activityType: null, status: "DONE", tareas: [] },
    { id: "b", name: "Diseño", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null, status: "PENDING", tareas: [B1, B2] },
  ],
};
const SE_VA_B1: Cambio = { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("b1"), tareaId: "b1", faseId: "b", desde: fotoDeTarea(B1) };
const SE_VA_B2: Cambio = { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("b2"), tareaId: "b2", faseId: "b", desde: fotoDeTarea(B2) };
const v1 = (extra: Partial<Borrador> & Record<string, unknown> = {}): Record<string, unknown> =>
  JSON.parse(
    JSON.stringify({
      formato: FORMATO_BORRADOR,
      version: 2,
      origen: "contexto",
      observaciones: [],
      cambios: [SE_VA_B1, SE_VA_B2],
      pedido: "regenerar",
      tareas: { corrida: "run-2", listas: true },
      tareasArmadasPara: { b: { nombre: "Diseño", semanas: 2 } },
      ...extra,
    }),
  );
const listas = { estado: "listas" as const, fase: null, motivo: null };

describe("cuándo el chat puede cambiar la propuesta, y por qué no", () => {
  const caso = (guardado: unknown, tareas: Parameters<typeof porQueDeSoloLectura>[0]["tareas"]) =>
    porQueDeSoloLectura({ guardado, borrador: leerBorrador(guardado, VIVO), tareas });

  it("⭐ los cinco casos de solo lectura, cada uno con su porqué", () => {
    /* Son los frenos de la ruta que edita la propuesta: si el chat creyera que puede, acordaría algo que
       la ruta rechaza. Las ediciones que la ponen en rojo: dejar de mirar el recálculo, el vacío o los
       cambios desconocidos. */
    expect(caso({ phases: [{ id: "b", name: "Diseño", durationWeeks: 3 }] }, null)).toBe("formato-viejo");
    const deOtraVersion = [{ tipo: "tarea-que-no-existe", clave: "x" }] as unknown as Cambio[];
    expect(caso(v1({ cambios: deOtraVersion }), listas)).toBe("version-nueva");
    const vacio = v1({ cambios: [], tareas: { corrida: "run-3", listas: false } });
    expect(caso(vacio, { estado: "armando", fase: null, motivo: null })).toBe("vacio-armando");
    expect(caso(vacio, { estado: "fallo", fase: null, motivo: null })).toBe("vacio-fallido");
    expect(caso(vacio, null), "sin saber, no se afirma un fallo").toBe("vacio-armando");
    const armando = v1({ tareas: { corrida: "run-3", listas: false } });
    expect(caso(armando, { estado: "armando", fase: "Leyendo las reuniones", motivo: null })).toBe("tareas-armando");
    const recalculo = { estado: "armando" as const, corrida: "run-r", fases: ["b"], nombres: ["Diseño"], fase: null, motivo: null };
    expect(caso(v1(), { ...listas, recalculo })).toBe("recalculando");
  });

  it("y editable cuando nada de eso pasa (también con el recálculo que falló o las tareas que no llegaron)", () => {
    expect(caso(v1(), listas)).toBeNull();
    const fallo = { estado: "fallo" as const, corrida: "run-r", fases: ["b"], nombres: ["Diseño"], fase: null, motivo: "se cortó" };
    expect(caso(v1(), { ...listas, recalculo: fallo })).toBeNull();
    expect(caso(v1({ tareas: { corrida: "run-3", listas: false } }), { estado: "fallo", fase: null, motivo: null })).toBeNull();
    const p = propuestaParaElChat({ guardado: v1(), token: "run-2", vivo: VIVO, tareas: listas });
    expect(p.modo).toBe("editable");
    expect(p.porQue).toBeNull();
    expect(p.token).toBe("run-2");
    expect(p.version).toBe(2);
    expect(p.desde).toBe("desde «Regenerar todo»");
  });
});

describe("⭐ el resumen es el de la barra", () => {
  it("⭐ con lo desmarcado que guardó el SERVIDOR, y los mismos números", () => {
    /* D5: lo desmarcado se ve en cualquier computadora, y el chat habla de «el 2» con el mismo número y
       el mismo estado que la barra. La edición que la pone en rojo: resumir sin `excluidos` (el chat
       diría «marcado» lo que la barra muestra desmarcado). */
    const guardado = v1({ excluidos: [claveDeTareaQueSeVa("b2")] });
    const p = propuestaParaElChat({ guardado, token: "run-2", vivo: VIVO, tareas: listas });
    expect(p.excluidos).toEqual([claveDeTareaQueSeVa("b2")]);
    const deLaBarra = resumir(VIVO, leerBorrador(guardado, VIVO)!, [claveDeTareaQueSeVa("b2")], { tareas: "listas", forzar: [] });
    expect(p.resumen?.huella).toBe(deLaBarra.huella);
    expect(p.resumen?.grupos.map((g) => g.numero)).toEqual(deLaBarra.grupos.map((g) => g.numero));
    const b2 = p.resumen?.grupos[0].tareas.find((t) => t.ref === "b2");
    expect(b2?.estado).toBe("excluido");
    expect(p.plan?.huella).toBe(deLaBarra.huella);
  });

  it("sin nada guardado todavía, nada desmarcado", () => {
    const p = propuestaParaElChat({ guardado: v1(), token: "run-2", vivo: VIVO, tareas: listas });
    expect(p.excluidos).toEqual([]);
    expect(p.resumen?.marcadas).toBe(p.resumen?.aplicables);
  });
});

describe("la lectura de la base", () => {
  afterEach(() => vi.clearAllMocks());
  const faseLeida = (f: Vivo["fases"][number]) => ({
    id: f.id,
    name: f.name,
    order: 0,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    sessionCount: f.sessionCount,
    notes: f.notes,
    activityType: f.activityType,
    status: f.status!,
    tasks: (f.tareas ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      weekIndex: t.weekIndex,
      order: 0,
      notes: t.notes,
      party: t.party,
      type: t.type,
      status: t.status,
      source: t.source,
      startDateOverride: null,
      dueDateOverride: null,
      needsValidation: false,
    })),
  });

  it("sin propuesta guardada, no hay nada que leer", async () => {
    db.projectTimeline.findUnique.mockResolvedValue({ anchorStartDate: null, pendingProposal: null, pendingProposalRunId: null, phases: [] });
    expect(await leerPropuestaParaElChat("tl-1")).toBeNull();
    db.projectTimeline.findUnique.mockResolvedValue(null);
    expect(await leerPropuestaParaElChat("tl-1")).toBeNull();
  });

  it("⭐ lee lo vivo como aplicar (tareas con sus notas y el estado de cada fase) y el estado de su corrida", async () => {
    /* Paridad (§0.4 de la especificación): si el chat leyera otra cosa que aplicar, su plan diferiría del
       de la barra, y una tarea editada a mano (su nota) no chocaría. La edición que la pone en rojo: leer
       las fases con otro select, o no mirar la corrida de las tareas. */
    db.projectTimeline.findUnique.mockResolvedValue({
      anchorStartDate: new Date(VIVO.ancla!),
      pendingProposal: v1({ tareas: { corrida: "run-3", listas: false } }),
      pendingProposalRunId: "run-3",
      phases: VIVO.fases.map(faseLeida),
    });
    db.agentRun.findUnique.mockResolvedValue({ status: "RUNNING", updatedAt: new Date(), currentPhase: "Leyendo", output: null });
    const p = await leerPropuestaParaElChat("tl-1");
    const pedido = db.projectTimeline.findUnique.mock.calls[0][0] as { where: unknown; select: { phases: unknown } };
    expect(pedido.where).toEqual({ id: "tl-1" });
    expect(pedido.select.phases).toBe(SELECT_DE_FASES_CON_TAREAS);
    expect(p?.vivo.fases.map((f) => f.status)).toEqual(["DONE", "PENDING"]);
    expect(p?.vivo.fases[1].tareas?.[0].notes).toBe("lo que dijo el cliente");
    expect(p?.estado).toBe("armando");
    expect(p?.modo).toBe("solo-lectura");
    expect(p?.porQue).toBe("tareas-armando");
    expect(p?.token).toBe("run-3");
  });
});
