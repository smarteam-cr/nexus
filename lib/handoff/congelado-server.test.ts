/**
 * lib/handoff/congelado-server.test.ts — congelar el handoff contra una base de mentira: idempotente, sin
 * contenido no congela, rehacer deja «rehecho» y «congelado» en orden, y lo posterior al congelado sale del
 * chokepoint y solo lo que ya ocurrió.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    hitoDeDocumento: { findMany: vi.fn(), create: vi.fn(async () => ({ id: "h" })) },
    projectCanvas: { findUnique: vi.fn(async () => ({ versionDocumento: 3 })) },
  };
  return {
    tx,
    projectCanvas: { findFirst: vi.fn() },
    project: { findUnique: vi.fn() },
    hitoDeDocumento: { findMany: vi.fn(), findFirst: vi.fn(async () => null) },
    versionDeDocumento: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    canvasBlock: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })), count: vi.fn(async () => 0) },
    handoffSource: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const versiones = vi.hoisted(() => ({
  guardarVersionDelDocumento: vi.fn(),
  fotoDelDocumento: vi.fn(async () => []),
  huellaDe: vi.fn((s: unknown) => JSON.stringify(s)),
  leerSecciones: vi.fn((s: unknown) => (Array.isArray(s) ? s : [])),
}));
vi.mock("@/lib/canvas/versiones", () => versiones);
vi.mock("./duenio", () => ({ resolverDuenioDelHandoff: vi.fn(async (id: string) => ({ ownerProjectId: id, redirigido: false, hermano: null })) }));
const feeding = vi.hoisted(() => ({ computeHandoffFeeding: vi.fn(async () => []) }));
vi.mock("./feeding", () => feeding);

import { congelarHandoff, leerCongelado, materialDesdeElCongelado, ultimoCambioDelHandoff } from "./congelado-server";
import { motivoDelHito, TIPO_CONGELADO, TIPO_REHECHO } from "./congelado";

const congeladoEl = (iso: string) => ({ tipo: TIPO_CONGELADO, createdAt: new Date(iso), porEmail: "a@x.com", motivo: motivoDelHito("boton"), fotoId: "foto-1" });

beforeEach(() => {
  vi.clearAllMocks();
  db.projectCanvas.findFirst.mockResolvedValue({ id: "canvas-1", versionDocumento: 3, contentUpdatedAt: null });
  db.hitoDeDocumento.findMany.mockResolvedValue([]);
  db.tx.hitoDeDocumento.findMany.mockResolvedValue([]);
  versiones.guardarVersionDelDocumento.mockResolvedValue({ guardada: true, id: "foto-nueva" });
});

describe("congelarHandoff", () => {
  it("congela: foto protegida y un hito «congelado» con la vía en el texto", async () => {
    const r = await congelarHandoff("p1", { via: "cronograma", porEmail: "cse@smarteamcr.com" });
    expect(r.ok && r.nuevo).toBe(true);
    expect(versiones.guardarVersionDelDocumento).toHaveBeenCalledWith("canvas-1", expect.objectContaining({ protegida: true, creadaPor: "cse@smarteamcr.com" }));
    expect(db.tx.$queryRaw).toHaveBeenCalled(); // la fila del canvas bloqueada antes de escribir
    expect(db.tx.hitoDeDocumento.create).toHaveBeenCalledTimes(1);
    expect(db.tx.hitoDeDocumento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ canvasId: "canvas-1", version: 3, tipo: TIPO_CONGELADO, fotoId: "foto-nueva", motivo: motivoDelHito("cronograma") }),
    });
  });

  it("⛔ ya congelado: no hace nada (aplicar dos veces congela una sola)", async () => {
    db.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    const r = await congelarHandoff("p1", { via: "cronograma", porEmail: null });
    expect(r).toMatchObject({ ok: true, nuevo: false });
    expect(versiones.guardarVersionDelDocumento).not.toHaveBeenCalled();
    expect(db.tx.hitoDeDocumento.create).not.toHaveBeenCalled();
  });

  it("si otro se adelantó entre la foto y el hito, no escribe y la foto nueva vuelve a ser común", async () => {
    db.tx.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    const r = await congelarHandoff("p1", { via: "boton", porEmail: null });
    expect(r).toMatchObject({ ok: true, nuevo: false });
    expect(db.tx.hitoDeDocumento.create).not.toHaveBeenCalled();
    expect(db.versionDeDocumento.update).toHaveBeenCalledWith({ where: { id: "foto-nueva" }, data: expect.objectContaining({ protegida: false }) });
  });

  it("sin contenido no congela", async () => {
    versiones.guardarVersionDelDocumento.mockResolvedValue({ guardada: false, motivo: "vacío" });
    expect(await congelarHandoff("p1", { via: "boton", porEmail: null })).toEqual({ ok: false, motivo: "sin-contenido" });
    expect(db.tx.hitoDeDocumento.create).not.toHaveBeenCalled();
  });

  it("sin documento de handoff no congela", async () => {
    db.projectCanvas.findFirst.mockResolvedValue(null);
    expect(await congelarHandoff("p1", { via: "boton", porEmail: null })).toEqual({ ok: false, motivo: "sin-documento" });
  });

  it("rehacer: quita las sugerencias pendientes, deja «rehecho» con el motivo y un milisegundo después el «congelado»", async () => {
    db.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    db.tx.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    db.canvasBlock.findMany.mockResolvedValue([
      { id: "sug", data: { sugerenciaDelHandoff: { cita: "x" } } },
      { id: "viejo", data: null },
    ] as never);
    const r = await congelarHandoff("p1", { via: "rehacer", porEmail: "v@x.com", motivo: "Ciclo 2: arranca Servicio" });
    expect(r.ok && r.nuevo).toBe(true);
    expect(db.canvasBlock.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["sug"] } } });
    const [rehecho, congelado] = db.tx.hitoDeDocumento.create.mock.calls.map((c) => (c as unknown as [{ data: { tipo: string; createdAt: Date; motivo: string } }])[0].data);
    expect(rehecho.tipo).toBe(TIPO_REHECHO);
    expect(rehecho.motivo).toBe("Ciclo 2: arranca Servicio");
    expect(congelado.tipo).toBe(TIPO_CONGELADO);
    expect(congelado.createdAt.getTime() - rehecho.createdAt.getTime()).toBe(1);
  });

  it("nunca tira: un error se devuelve como motivo", async () => {
    db.projectCanvas.findFirst.mockRejectedValue(new Error("se cayó"));
    expect(await congelarHandoff("p1", { via: "boton", porEmail: null })).toEqual({ ok: false, motivo: "error" });
  });
});

describe("leerCongelado y ultimoCambioDelHandoff", () => {
  it("leerCongelado nunca tira", async () => {
    db.projectCanvas.findFirst.mockRejectedValue(new Error("x"));
    expect((await leerCongelado("p1")).congelado).toBe(false);
  });

  it("sin congelar, el último cambio es la generación (como siempre)", async () => {
    const g = new Date("2026-09-01T00:00:00.000Z");
    db.project.findUnique.mockResolvedValue({ handoffGeneratedAt: g });
    db.projectCanvas.findFirst.mockResolvedValue({ id: "canvas-1", contentUpdatedAt: new Date("2026-09-20T00:00:00.000Z") });
    expect(await ultimoCambioDelHandoff("p1")).toEqual(g);
  });

  it("congelado y editado después: compara con la foto; si cambió lo que dice, cuenta la edición", async () => {
    const g = new Date("2026-09-01T00:00:00.000Z");
    const editado = new Date("2026-09-20T00:00:00.000Z");
    db.project.findUnique.mockResolvedValue({ handoffGeneratedAt: g });
    db.projectCanvas.findFirst.mockResolvedValue({ id: "canvas-1", contentUpdatedAt: editado });
    db.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    db.versionDeDocumento.findUnique.mockResolvedValue({ secciones: [{ key: "a", blocks: [] }] });
    versiones.fotoDelDocumento.mockResolvedValue([{ key: "a", blocks: [{ status: "CONFIRMED", content: "usada" }] }] as never);
    expect(await ultimoCambioDelHandoff("p1")).toEqual(editado);
  });

  it("congelado y solo con sugerencias pendientes (borradores): no cambió lo vendido", async () => {
    const g = new Date("2026-09-01T00:00:00.000Z");
    db.project.findUnique.mockResolvedValue({ handoffGeneratedAt: g });
    db.projectCanvas.findFirst.mockResolvedValue({ id: "canvas-1", contentUpdatedAt: new Date("2026-09-20T00:00:00.000Z") });
    db.hitoDeDocumento.findMany.mockResolvedValue([congeladoEl("2026-09-02T00:00:00.000Z")]);
    db.versionDeDocumento.findUnique.mockResolvedValue({ secciones: [{ key: "a", blocks: [] }] });
    versiones.fotoDelDocumento.mockResolvedValue([{ key: "a", blocks: [{ status: "DRAFT", content: "pendiente" }] }] as never);
    expect(await ultimoCambioDelHandoff("p1")).toEqual(g);
  });
});

describe("materialDesdeElCongelado", () => {
  it("solo lo posterior al congelado y que ya ocurrió, en orden; las fuentes manuales cargadas después", async () => {
    const ahora = Date.now();
    feeding.computeHandoffFeeding.mockResolvedValue([
      { id: "antes", title: "a", date: ahora - 30 * 86_400_000, participants: [] },
      { id: "despues-2", title: "c", date: ahora - 1 * 86_400_000, participants: [] },
      { id: "despues-1", title: "b", date: ahora - 5 * 86_400_000, participants: [] },
      { id: "futura", title: "d", date: ahora + 3 * 86_400_000, participants: [] },
    ] as never);
    db.handoffSource.findMany.mockResolvedValue([{ id: "fm", title: "Minuta", content: "x", createdAt: new Date() }] as never);
    const r = await materialDesdeElCongelado("p1", new Date(ahora - 10 * 86_400_000));
    expect(r.reuniones.map((s) => s.id)).toEqual(["despues-1", "despues-2"]);
    expect(r.fuentesManuales).toHaveLength(1);
    expect(db.handoffSource.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gt: expect.any(Date) } }) }));
  });
});
