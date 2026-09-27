/**
 * lib/timeline/referencias-de-la-propuesta.test.ts — CONTRA QUÉ SE COMPARA LA PROPUESTA (L4, spec §5.2 y §5.5).
 *
 * Correr: `npx vitest run lib/timeline/referencias-de-la-propuesta.test.ts --project unit`.
 *
 * Lo puro (referencias-de-la-propuesta.ts): lo prometido sale del snapshot VALIDADO; el handoff, de las fases válidas de
 * su salida con LA regla de analyze/route.ts (`fasesDelHandoff`, extraída de ahí); la caché no pasa de 50. Y la lectura
 * (leer-referencias.ts), con la base de mentira: el handoff se lee una vez por propuesta y nunca con una propuesta del
 * handoff, con el `where` único de las corridas de un documento; el GET lo manda y no se cae si falla.
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  agentRunFindFirst: vi.fn(),
  agentRunFindMany: vi.fn(),
  sesiones: vi.fn(),
  notas: vi.fn(),
  canvas: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    agentRun: { findFirst: db.agentRunFindFirst, findMany: db.agentRunFindMany },
    firefliesSession: { findMany: db.sesiones },
    timelineSource: { findMany: db.notas },
    projectCanvas: { findFirst: db.canvas },
  },
}));

import {
  cacheAcotada,
  fasesDelHandoff,
  fasesPublicadas,
  handoffDeLaSalida,
  prometidoDelSnapshot,
  TOPE_DE_LA_CACHE,
  VIDA_DEL_HANDOFF_MS,
} from "./referencias-de-la-propuesta";
import { leerReferenciasDeLaPropuesta } from "./leer-referencias";
import { ID_ESTRUCTURA_CRONOGRAMA } from "@/lib/agents/estructura-cronograma";

const leerFuente = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

describe("lo prometido: el snapshot validado", () => {
  const fase = (durationWeeks: unknown, order?: number, startWeek: unknown = null) => ({ name: "F", durationWeeks, startWeek, ...(order !== undefined ? { order } : {}) });

  it("⭐ sin fases, con una duración 0 (o no entera) o un inicio negativo: null", () => {
    /* La edición que la pone en rojo: comparar contra un snapshot a medias (una semana de menos diría «a tiempo»). */
    expect(fasesPublicadas(null)).toBeNull();
    expect(fasesPublicadas({ phases: [] })).toBeNull();
    expect(fasesPublicadas({ exists: false, phases: [fase(2)] })).toBeNull();
    expect(fasesPublicadas({ phases: [fase(2), fase(0)] })).toBeNull();
    expect(fasesPublicadas({ phases: [fase(2), fase(1.5)] })).toBeNull();
    expect(fasesPublicadas({ phases: [fase(2), fase("3")] })).toBeNull();
    expect(fasesPublicadas({ phases: [fase(2, 0, -1)] })).toBeNull();
    expect(fasesPublicadas({ phases: [fase(2, 0, 1.5)] })).toBeNull();
    expect(prometidoDelSnapshot(null, null)).toBeNull();
    expect(prometidoDelSnapshot({ anchorStartDate: "2026-05-19", phases: [fase(0)] }, null)).toBeNull();
  });

  it("⭐ ordena por `order` si todas lo traen; si no, el orden de la foto", () => {
    /* La edición que la pone en rojo: ignorar `order` (con un inicio fijo, el calendario da otro cierre). */
    expect(fasesPublicadas({ phases: [fase(3, 1), fase(1, 0, 0)] })).toEqual([
      { durationWeeks: 1, startWeek: 0 },
      { durationWeeks: 3, startWeek: null },
    ]);
    expect(fasesPublicadas({ phases: [fase(3, 1), fase(1)] })).toEqual([
      { durationWeeks: 3, startWeek: null },
      { durationWeeks: 1, startWeek: null },
    ]);
  });

  it("el cierre prometido sale del arranque DEL SNAPSHOT (el que vio el cliente) y trae el día que se subió", () => {
    const snap = { anchorStartDate: "2026-05-19T00:00:00.000Z", phases: [fase(4, 0), fase(8, 1)] };
    expect(prometidoDelSnapshot(snap, new Date("2026-08-03T15:00:00.000Z"))).toEqual({
      cierreISO: "2026-08-11",
      semanas: 12,
      fecha: "2026-08-03T15:00:00.000Z",
    });
    expect(prometidoDelSnapshot({ ...snap, anchorStartDate: null }, null)).toEqual({ cierreISO: null, semanas: 12, fecha: null });
  });
});

describe("el handoff: las fases de su salida, con la regla de analyze", () => {
  it("⭐ descarta como analyze: sin nombre, sin duración o con duración ≤ 0; recorta, redondea y numera", () => {
    /* La edición que la pone en rojo: una regla distinta de la que crea el cronograma del handoff. */
    expect(fasesDelHandoff(null)).toEqual([]);
    expect(fasesDelHandoff({ timeline: { phases: [] } })).toEqual([]);
    expect(fasesDelHandoff({ timeline: { phases: "no" } })).toEqual([]);
    const fases = fasesDelHandoff({
      timeline: {
        phases: [
          { name: "  Kickoff  ", durationWeeks: 1.7, sessionCount: 2.9, notes: "  ", estimated: true },
          { name: "", durationWeeks: 3 },
          { name: "Sin duración" },
          { name: "Cero", durationWeeks: 0 },
          null,
          { name: "Paralela", durationWeeks: 2, startWeek: 3.4, notes: " nota " },
          { name: "Negativa", durationWeeks: 2, startWeek: -1, sessionCount: 0 },
        ],
      },
    });
    expect(fases).toEqual([
      { name: "Kickoff", order: 0, durationWeeks: 1, startWeek: null, sessionCount: 2, notes: null, needsValidation: true, source: "AGENT" },
      { name: "Paralela", order: 1, durationWeeks: 2, startWeek: 3, sessionCount: null, notes: "nota", needsValidation: false, source: "AGENT" },
      { name: "Negativa", order: 2, durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, needsValidation: false, source: "AGENT" },
    ]);
  });

  it("⭐ analyze/route.ts usa `fasesDelHandoff` y ya no tiene su copia de la validación", () => {
    /* La edición que la pone en rojo: volver a copiar la validación en analyze (dos reglas que un día difieren: el
       mensaje compararía contra fases que el cronograma no habría creado). */
    const analyze = soloCodigo(leerFuente("app/api/clients/[id]/analyze/route.ts"));
    expect(analyze).toContain("const validPhases = fasesDelHandoff(analysisJson);");
    expect(analyze).not.toContain("obj.durationWeeks > 0");
    expect(analyze).not.toContain("p.estimated === true");
  });

  it("la salida guardada: sus semanas de calendario, o null si no se deja leer o no tiene fases", () => {
    const corrio = new Date("2026-08-12T10:00:00.000Z");
    const salida = JSON.stringify({ timeline: { phases: [{ name: "A", durationWeeks: 5 }, { name: "B", durationWeeks: 8 }] } });
    expect(handoffDeLaSalida(salida, corrio)).toEqual({ semanas: 13, fecha: "2026-08-12T10:00:00.000Z" });
    expect(handoffDeLaSalida("{roto", corrio)).toBeNull();
    expect(handoffDeLaSalida(null, corrio)).toBeNull();
    expect(handoffDeLaSalida(JSON.stringify({ cards: [] }), corrio)).toBeNull();
  });
});

describe("la caché acotada", () => {
  it("⭐ no pasa de 50: expulsa la más vieja, y volver a guardar una la hace nueva", () => {
    /* La edición que la pone en rojo: una caché sin tope (crece con cada propuesta abierta mientras vive el proceso). */
    expect(TOPE_DE_LA_CACHE).toBe(50);
    const c = cacheAcotada<number>();
    for (let i = 0; i < 60; i++) c.set(`t${i}`, i);
    expect(c.size).toBe(50);
    expect(c.has("t9")).toBe(false);
    expect(c.get("t10")).toBe(10);
    c.set("t10", 100);
    c.set("t60", 60);
    expect(c.has("t10"), "la que se volvió a guardar no es la más vieja").toBe(true);
    expect(c.has("t11")).toBe(false);
    expect(c.size).toBe(50);
  });

  it("⭐ revisión de L1–L7 (#7): con `vidaMs`, una entrada vieja ya no está", () => {
    /* La edición que la pone en rojo: una caché sin tiempo de vida (el handoff de la propuesta abierta quedaba el del
       primer GET hasta reiniciar el proceso). */
    expect(VIDA_DEL_HANDOFF_MS).toBe(5 * 60_000);
    let t = 1_000;
    const c = cacheAcotada<string>(TOPE_DE_LA_CACHE, VIDA_DEL_HANDOFF_MS, () => t);
    c.set("p1:run", "10 semanas");
    t += VIDA_DEL_HANDOFF_MS - 1;
    expect(c.get("p1:run")).toBe("10 semanas");
    t += 1;
    expect(c.has("p1:run"), "la entrada vieja sigue").toBe(false);
    expect(c.get("p1:run")).toBeUndefined();
  });
});

describe("la lectura (leer-referencias.ts) y el GET", () => {
  const V1 = (o: Record<string, unknown> = {}) => ({
    formato: "borrador-v1",
    version: 1,
    origen: "contexto",
    pedido: "regenerar",
    observaciones: [],
    cambios: [],
    tareas: { corrida: "run-paso2", listas: true },
    tareasArmadasPara: {},
    ...o,
  });
  const leer = (token: string, guardado: unknown = V1()) =>
    leerReferenciasDeLaPropuesta({ projectId: "p1", guardado, token, publishedSnapshot: null, publicadoEn: null });

  beforeEach(() => {
    db.agentRunFindFirst.mockReset().mockResolvedValue({
      id: "h1",
      output: JSON.stringify({ timeline: { phases: [{ name: "A", durationWeeks: 13 }] } }),
      createdAt: new Date("2026-08-12T10:00:00.000Z"),
    });
    db.agentRunFindMany.mockReset().mockResolvedValue([
      { id: "run-paso1", agentSlug: ID_ESTRUCTURA_CRONOGRAMA, sourceSessionIds: ["s1"], createdAt: new Date("2026-09-26T10:00:00.000Z") },
      { id: "run-paso2", agentSlug: "agent-timeline-detail", sourceSessionIds: ["s1", "s2"], createdAt: new Date("2026-09-26T10:05:00.000Z") },
    ]);
    db.sesiones.mockReset().mockResolvedValue([{ title: "Seguimiento", date: new Date("2026-09-12T15:00:00.000Z") }]);
    db.notas.mockReset().mockResolvedValue([{ title: "Acta" }, { title: null }]);
    db.canvas.mockReset().mockResolvedValue({ sections: [{ key: "__doc", brief: "Priorizar la fase A." }] });
  });

  it("⭐ el handoff se lee UNA vez por propuesta (caché por token), con la última corrida DONE del grupo `handoff`", () => {
    /* La edición que la pone en rojo: leer el `AgentRun` del handoff en cada GET (sin índice por proyecto y con una
       salida de ~150 KB), o filtrar sin el estado DONE. */
    return (async () => {
      const a = await leer("run-paso1");
      const b = await leer("run-paso1");
      expect(a?.handoff).toEqual({ semanas: 13, fecha: "2026-08-12T10:00:00.000Z" });
      expect(b?.handoff).toEqual(a?.handoff);
      expect(db.agentRunFindFirst).toHaveBeenCalledTimes(1);
      const q = db.agentRunFindFirst.mock.calls[0][0];
      expect(q.where).toEqual({ projectId: "p1", agent: { agentGroup: "handoff" }, status: "DONE" });
      expect(q.orderBy).toEqual({ createdAt: "desc" });
      await leer("otro-token");
      expect(db.agentRunFindFirst, "otra propuesta, otra lectura").toHaveBeenCalledTimes(2);
    })();
  });

  it("⭐ revisión de L1–L7 (#7): sin handoff no se recuerda nada, y un handoff regenerado se ve pasados 5 minutos", async () => {
    /* Las ediciones que la ponen en rojo: volver a guardar null (sin handoff en el primer GET, la comparación no aparecía
       nunca para esa propuesta), o sacarle el tiempo de vida a la caché (el de 10 semanas quedaba aunque el agente
       propusiera 14). */
    db.agentRunFindFirst.mockResolvedValueOnce(null);
    expect((await leer("run-sin-handoff"))?.handoff).toBeNull();
    expect((await leer("run-sin-handoff"))?.handoff, "no se volvió a leer").toEqual({ semanas: 13, fecha: "2026-08-12T10:00:00.000Z" });
    expect(db.agentRunFindFirst).toHaveBeenCalledTimes(2);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
      expect((await leer("run-regenerado"))?.handoff?.semanas).toBe(13);
      db.agentRunFindFirst.mockResolvedValue({
        id: "h2",
        output: JSON.stringify({ timeline: { phases: [{ name: "A", durationWeeks: 14 }] } }),
        createdAt: new Date("2026-09-26T12:01:00.000Z"),
      });
      vi.setSystemTime(new Date("2026-09-26T12:04:00.000Z"));
      expect((await leer("run-regenerado"))?.handoff?.semanas, "dentro de los 5 minutos, el recordado").toBe(13);
      vi.setSystemTime(new Date("2026-09-26T12:05:00.000Z"));
      expect((await leer("run-regenerado"))?.handoff?.semanas, "pasados 5 minutos sigue el handoff viejo").toBe(14);
    } finally {
      vi.useRealTimers();
    }
  });

  it("⭐ con una propuesta del handoff no se compara contra el handoff (ni se lee)", async () => {
    /* La edición que la pone en rojo: leer el handoff para la propuesta que salió de él. */
    const r = await leer("run-handoff", V1({ origen: "handoff", pedido: null, tareas: null }));
    expect(r?.handoff).toBeNull();
    expect(db.agentRunFindFirst).not.toHaveBeenCalled();
  });

  it("las fuentes: la unión de las reuniones de las dos corridas, las notas hasta la más nueva y si hay instrucciones", async () => {
    const r = await leer("run-paso1");
    expect(r?.fuentes).toEqual({
      instrucciones: true,
      reuniones: [{ titulo: "Seguimiento", fecha: "2026-09-12T15:00:00.000Z" }],
      notas: ["Acta", "Nota sin título"],
    });
    expect(db.sesiones.mock.calls[0][0].where).toEqual({ id: { in: ["s1", "s2"] } });
    expect(db.notas.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null, createdAt: { lte: new Date("2026-09-26T10:05:00.000Z") } });
    // El token que no es del paso 1 (otra corrida) no suma sus reuniones.
    db.agentRunFindMany.mockResolvedValueOnce([{ id: "run-x", agentSlug: "otro", sourceSessionIds: ["s9"], createdAt: new Date() }]);
    expect((await leer("run-x", V1({ tareas: null })))?.fuentes).toBeNull();
  });

  it("sin un borrador-v1 que se deje leer: null (el GET manda null)", async () => {
    expect(await leer("t", { phases: [] })).toBeNull();
    expect(await leer("t", null)).toBeNull();
  });

  it("⭐ el GET la manda, no se cae si falla, y nadie escribe su propio `where` del handoff", () => {
    /* Las ediciones que la ponen en rojo: sacarla del GET, dejar que un fallo tumbe el cronograma, o escribir
       `agentGroup: "handoff"` a mano (el `where` de las corridas de un documento vive en historial-corridas.ts). */
    const ruta = soloCodigo(leerFuente("app/api/projects/[projectId]/timeline/route.ts"));
    expect(ruta).toMatch(/leerReferenciasDeLaPropuesta\(\{[\s\S]*?\}\)\.catch\(\(\) => null\)/);
    expect(ruta).toContain("referenciasDeLaPropuesta,");
    const lectura = soloCodigo(leerFuente("lib/timeline/leer-referencias.ts"));
    expect(lectura).toContain('whereCorridasDeDocumento(projectId, "handoff")');
    for (const [rel, src] of [
      ["timeline/route.ts", ruta],
      ["leer-referencias.ts", lectura],
      ["referencias-de-la-propuesta.ts", soloCodigo(leerFuente("lib/timeline/referencias-de-la-propuesta.ts"))],
    ] as const) {
      expect(src, rel).not.toMatch(/agentGroup:\s*"handoff"/);
      expect(src, `${rel} importa de Google`).not.toMatch(/from "(googleapis|@\/lib\/google[^"]*)"/);
    }
  });
});
