import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aColumna,
  leerEstado,
  lineaDelDocumento,
  revisarParaPresentar,
} from "./estado-del-documento";
import { MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA, presentarDocumento, trasRegenerar } from "./estado-del-documento-servidor";
import { POLITICA_RECTORA_KEY } from "@/components/landing/configs/diagnostico.defs";
import { runDiagnosticoGeneration } from "./diagnostico-generate";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { guardarVersionDelDocumento } from "./versiones";
import type { CaboSuelto } from "./revisar-hilo";

// La parte que ESCRIBE (estado-del-documento-servidor.ts), con la base y HubSpot falsos. Lo puro de
// arriba no los usa.
const db = vi.hoisted(() => ({
  projectCanvas: { findUnique: vi.fn(), updateMany: vi.fn() },
  hitoDeDocumento: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  canvasSection: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  canvasBlock: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  versionDeDocumento: { update: vi.fn() },
  $transaction: vi.fn(),
}));
const hubspot = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn(async () => {}) }));
vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: async () => hubspot }));
vi.mock("./versiones", () => ({
  fotoDelDocumento: vi.fn(async () => ({ secciones: [] })),
  guardarVersionDelDocumento: vi.fn(async () => ({ id: "foto-nueva" })),
  huellaDe: () => "huella-presentada",
  tieneContenido: () => true,
}));
// El runner del diagnóstico (lib/canvas/diagnostico-generate.ts): la IA y sus fuentes, falsas.
vi.mock("@/lib/business-cases/canvas-agent", () => ({ generateSectionsForTemplate: vi.fn() }));
vi.mock("@/lib/canvas/diagnostico-fuentes", () => ({ fuentesDelDiagnostico: vi.fn(async () => "las fuentes") }));
vi.mock("@/lib/canvas/default-canvases", () => ({ createOnDemandCanvas: vi.fn(), reconcileOnDemandCanvasSections: vi.fn() }));
vi.mock("@/lib/canvas/retirar-secciones", () => ({ ocultarSeccionesRetiradas: vi.fn(async () => {}) }));
vi.mock("@/lib/handoff/resultados", () => ({ resultadosDelProyecto: vi.fn(async () => ({ resultados: [] })) }));
vi.mock("@/lib/handoff/proponer-resultados", () => ({ leerOProponerResultados: vi.fn(async () => null) }));

const POLITICA_REVISADA = { intro: "¿En qué debemos enfocarnos?", items: [{ title: "HubSpot como única fuente", detail: "…" }], revisadaAt: "2026-10-02T10:00:00.000Z" };
const roto: CaboSuelto = { seccion: "acciones", texto: "La causa F2 no tiene ninguna acción que la ataque.", bloquea: true };
const aviso: CaboSuelto = { seccion: "objetivos", texto: "El objetivo OBJ-03 no lo mueve ninguna acción.", bloquea: false };

describe("estado del documento: borrador, presentado y aprobado", () => {
  it("la columna guarda null para el borrador y cualquier valor raro se lee como borrador", () => {
    expect(leerEstado(null)).toBe("borrador");
    expect(leerEstado("cualquiera")).toBe("borrador");
    expect(leerEstado("aprobado")).toBe("aprobado");
    expect(aColumna("borrador")).toBeNull();
    expect(aColumna("presentado")).toBe("presentado");
  });

  it("se presenta con el hilo cerrado y la política revisada (los avisos no frenan)", () => {
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [aviso], politica: POLITICA_REVISADA })).toEqual({ ok: true, motivos: [], detalle: [] });
  });

  it("2026-10-28: un cabo suelto, la política sin revisar o sin política son AVISOS: se juntan todos y no frenan", () => {
    const r = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [roto], politica: { ...POLITICA_REVISADA, revisadaAt: "" } });
    expect(r.ok).toBe(true);
    expect(r.motivos).toEqual([]);
    expect(r.detalle).toHaveLength(2);
    expect(r.detalle[0].texto).toContain("La causa F2 no tiene ninguna acción");
    expect(r.detalle[1].texto).toContain("sugerencia de la IA");
    expect(r.detalle.some((m) => m.bloquea)).toBe(false);
    const sinPolitica = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: undefined });
    expect(sinPolitica.ok).toBe(true);
    expect(sinPolitica.detalle[0].texto).toContain("Falta el enfoque de la solución");
  });

  it("un enfoque OCULTO a propósito no frena la presentación (2026-10-23: toda sección se puede ocultar)", () => {
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: undefined, politicaOculta: true })).toEqual({ ok: true, motivos: [], detalle: [] });
  });

  it("L2 (2026-10-24): el desafío principal con algo escrito también se revisa; oculto o vacío no frena", () => {
    const desafio = { intro: "¿Por qué invertimos en pauta y no sabemos cuántas matrículas trae?", items: [{ title: "Le hablan igual a todos" }] };
    const r = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA, desafio });
    expect(r.ok).toBe(true); // aviso, no frena (2026-10-28)
    expect(r.detalle).toEqual([{ texto: expect.stringContaining("desafío principal"), seccion: "desafio" }]);
    const revisado = { ...desafio, revisadaAt: "2026-10-24T10:00:00.000Z" };
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA, desafio: revisado }).ok).toBe(true);
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA, desafio, desafioOculto: true }).ok).toBe(true);
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA, desafio: { intro: "", items: [] } }).ok).toBe(true);
  });

  it("L2: cada motivo dice en qué sección se arregla (para el enlace de «Presentar» y de «Publicar»)", () => {
    const r = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [roto], politica: { ...POLITICA_REVISADA, revisadaAt: "" } });
    expect(r.detalle.map((m) => m.seccion)).toEqual(["acciones", "politica_rectora"]);
    expect(r.motivos).toEqual([]);
  });

  it("aprobado no se presenta (está cerrado), y sin contenido no hay nada que presentar", () => {
    const aprobado = revisarParaPresentar({ estado: "aprobado", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA });
    expect(aprobado.ok).toBe(false);
    expect(aprobado.motivos[0]).toContain("reábrelo");
    const vacio = revisarParaPresentar({ estado: "borrador", tieneContenido: false, cabos: [], politica: POLITICA_REVISADA });
    expect(vacio.ok).toBe(false);
    expect(vacio.motivos[0]).toContain("genera el diagnóstico");
  });

  it("la línea de la portada sigue a FUNDAUNA", () => {
    const l = lineaDelDocumento({ cliente: "FUNDAUNA", fecha: new Date("2026-09-24T18:00:00.000Z"), version: 1, estado: "borrador" });
    expect(l).toBe("Cliente: FUNDAUNA · Fecha: 24 de septiembre de 2026 · Versión: v1 · Estado: Borrador");
  });
});

describe("regenerar sobre lo presentado (lo que escribe)", () => {
  const documento = (cambios: Record<string, unknown> = {}) => ({
    id: "c1",
    name: "Diagnóstico",
    slug: "diagnosis",
    projectId: "p1",
    sections: null,
    estadoDocumento: "presentado",
    versionDocumento: 2,
    contentUpdatedAt: null,
    updatedAt: new Date("2026-10-04T12:00:00Z"),
    project: { clientId: "cl1", hubspotOwnerEmail: null, client: { name: "Cliente", hubspotCompanyId: "hs1" } },
    canvasSections: [],
    ...cambios,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    db.projectCanvas.findUnique.mockResolvedValue(documento());
    db.projectCanvas.updateMany.mockResolvedValue({ count: 1 });
    db.hitoDeDocumento.findMany.mockResolvedValue([]);
    db.hitoDeDocumento.create.mockResolvedValue({ id: "hito-nuevo" });
    db.hitoDeDocumento.update.mockResolvedValue({});
    db.hitoDeDocumento.findFirst.mockImplementation(async ({ where }: { where: { tipo: string } }) =>
      where.tipo === "presentado"
        ? { id: "h-presentado", fotoId: "foto-v2", foto: { huella: "huella-presentada" } }
        : { aprobadoPorNombre: "Pablo Olivas", aprobadoEl: new Date("2026-10-03T12:00:00Z") },
    );
    hubspot.apiRequest.mockResolvedValue({ ok: true, json: async () => ({ id: "nota-1" }) });
  });

  it("regenerar no pisa lo que pasó entre la lectura y la escritura (una aprobación, por ejemplo)", async () => {
    /* Lo que lo pone en rojo: volver a cambiar a borrador sin condición o dejar el hito «reabierto»
       aunque el cambio no tomó la fila. */
    db.projectCanvas.updateMany.mockResolvedValue({ count: 0 });
    await trasRegenerar("c1");
    expect(db.projectCanvas.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", estadoDocumento: "presentado", versionDocumento: 2 },
      data: { estadoDocumento: null, versionDocumento: 3 },
    });
    expect(db.hitoDeDocumento.create).not.toHaveBeenCalled();
  });
});

describe("presentar toma el documento (lo que escribe)", () => {
  /* Antes leía y escribía sin condición: dos «Presentar» a la vez dejaban dos hitos, y presentar
     mientras el cliente aprobaba pisaba la aprobación con «presentado». */
  const documento = (cambios: Record<string, unknown> = {}) => ({
    id: "c1",
    name: "Diagnóstico",
    slug: "diagnosis",
    projectId: "p1",
    sections: null,
    estadoDocumento: null,
    versionDocumento: 1,
    contentUpdatedAt: null,
    updatedAt: new Date("2026-10-04T12:00:00Z"),
    project: { clientId: "cl1", hubspotOwnerEmail: null, client: { name: "Cliente", hubspotCompanyId: "hs1" } },
    canvasSections: [{ key: POLITICA_RECTORA_KEY, blocks: [{ data: POLITICA_REVISADA }] }],
    ...cambios,
  });
  /** El último «presentado» tiene esta huella; ninguna otra foto la usa un hito. */
  const presentadoConHuella = (huella: string) =>
    db.hitoDeDocumento.findFirst.mockImplementation(async ({ where }: { where: { tipo?: string; fotoId?: string } }) =>
      where.tipo === "presentado" ? { id: "h-presentado", fotoId: "foto-vieja", foto: { huella } } : null,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    db.projectCanvas.findUnique.mockResolvedValue(documento());
    db.projectCanvas.updateMany.mockResolvedValue({ count: 1 });
    db.hitoDeDocumento.findMany.mockResolvedValue([]);
    db.hitoDeDocumento.create.mockResolvedValue({ id: "hito-presentado" });
    db.versionDeDocumento.update.mockResolvedValue({});
    presentadoConHuella("huella-presentada");
  });

  it("⭐ dos «Presentar» a la vez: la toma es condicional a lo leído y el segundo no deja otro hito", async () => {
    db.projectCanvas.updateMany.mockResolvedValue({ count: 0 }); // el otro clic ya lo presentó
    db.projectCanvas.findUnique.mockResolvedValueOnce(documento()).mockResolvedValue(documento({ estadoDocumento: "presentado" }));
    const r = await presentarDocumento("c1", "cse@smarteamcr.com");
    expect(db.projectCanvas.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", estadoDocumento: null, versionDocumento: 1 },
      data: { estadoDocumento: "presentado", versionDocumento: 1 },
    });
    expect(db.hitoDeDocumento.create, "dejó un segundo hito «presentado»").not.toHaveBeenCalled();
    // Era lo mismo: para quien hizo el doble clic, está presentado.
    expect(r.ok).toBe(true);
  });

  it("⭐ presentar mientras el cliente aprueba: 409, no pisa la aprobación y la foto no queda como evidencia", async () => {
    presentadoConHuella("otra-huella"); // se editó después de presentar: iría como v3
    db.projectCanvas.updateMany.mockResolvedValue({ count: 0 });
    db.projectCanvas.findUnique
      .mockResolvedValueOnce(documento({ estadoDocumento: "presentado", versionDocumento: 2 }))
      .mockResolvedValue(documento({ estadoDocumento: "aprobado", versionDocumento: 2 }));
    const r = await presentarDocumento("c1", "cse@smarteamcr.com");
    expect(db.projectCanvas.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", estadoDocumento: "presentado", versionDocumento: 2 },
      data: { estadoDocumento: "presentado", versionDocumento: 3 },
    });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(db.hitoDeDocumento.create, "presentó encima de la aprobación").not.toHaveBeenCalled();
    expect(db.versionDeDocumento.update).toHaveBeenCalledWith({ where: { id: "foto-nueva" }, data: expect.objectContaining({ protegida: false }) });
  });

  it("sin carrera: toma el documento y deja el hito con la foto", async () => {
    const r = await presentarDocumento("c1", "cse@smarteamcr.com");
    expect(r.ok).toBe(true);
    expect(db.hitoDeDocumento.create).toHaveBeenCalledWith({
      data: { canvasId: "c1", version: 1, tipo: "presentado", porEmail: "cse@smarteamcr.com", fotoId: "foto-nueva" },
      select: { id: true },
    });
    expect(db.versionDeDocumento.update).not.toHaveBeenCalled();
  });
});

describe("regenerar el diagnóstico no escribe sobre lo que el cliente aprobó mientras corría la IA", () => {
  /* Antes solo se miraba «aprobado» al ARRANCAR: si el cliente aprobaba durante los minutos de la IA,
     lo nuevo se escribía igual sobre el diagnóstico aprobado. */
  const estado = (estadoDocumento: string | null) => ({ estadoDocumento, versionDocumento: 2 });
  const GENERADO = { sections: [{ key: "situacion", data: { titulo: "nuevo" } }, { key: "acciones", data: { items: [] } }] };
  const regenerar = () => runDiagnosticoGeneration({ projectId: "p1", canvasId: "c1", agentRunId: "run-1" });

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? arg(db) : Promise.all(arg as unknown[])));
    db.projectCanvas.findUnique.mockResolvedValue(estado("presentado"));
    db.projectCanvas.updateMany.mockResolvedValue({ count: 1 });
    db.canvasSection.findMany.mockResolvedValue([
      { id: "s1", key: "situacion", order: 0, blocks: [] },
      { id: "s2", key: "acciones", order: 1, blocks: [] },
    ]);
    db.canvasSection.update.mockResolvedValue({});
    db.canvasBlock.deleteMany.mockResolvedValue({ count: 1 });
    db.canvasBlock.create.mockResolvedValue({});
    db.canvasBlock.findFirst.mockResolvedValue(null);
    db.hitoDeDocumento.create.mockResolvedValue({ id: "hito-reabierto" });
    vi.mocked(generateSectionsForTemplate).mockResolvedValue(GENERADO as never);
  });

  it("⭐ el cliente aprobó mientras corría la IA: no escribe ni un bloque y la corrida falla con el motivo", async () => {
    vi.mocked(generateSectionsForTemplate).mockImplementation(async () => {
      db.projectCanvas.findUnique.mockResolvedValue(estado("aprobado")); // aprobó desde su enlace
      return GENERADO as never;
    });
    await expect(regenerar()).rejects.toThrow(MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA);
    expect(db.canvasBlock.deleteMany, "escribió sobre el diagnóstico aprobado").not.toHaveBeenCalled();
    expect(db.canvasBlock.create).not.toHaveBeenCalled();
    expect(guardarVersionDelDocumento, "guardó la foto «Antes de regenerar» de algo que no se va a regenerar").not.toHaveBeenCalled();
  });

  it("⭐ aprobó entre la última mirada y la escritura: la toma no agarra la fila y no escribe nada", async () => {
    db.projectCanvas.updateMany.mockResolvedValue({ count: 0 });
    await expect(regenerar()).rejects.toThrow(MENSAJE_APROBADO_MIENTRAS_SE_REGENERABA);
    expect(db.canvasBlock.deleteMany, "escribió aunque la toma no agarró el documento").not.toHaveBeenCalled();
    expect(db.canvasBlock.create).not.toHaveBeenCalled();
  });

  it("sin aprobación: toma el documento, escribe en ESA transacción y abre la versión siguiente ahí mismo", async () => {
    const r = await regenerar();
    expect(r).toEqual({ canvasId: "c1", sectionCount: 2 });
    const [toma, version] = db.projectCanvas.updateMany.mock.calls.map((c) => c[0]);
    expect(toma).toMatchObject({ where: { id: "c1", OR: [{ estadoDocumento: null }, { estadoDocumento: { not: "aprobado" } }] } });
    expect(db.projectCanvas.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.canvasBlock.deleteMany.mock.invocationCallOrder[0]);
    expect(db.canvasBlock.create).toHaveBeenCalledTimes(2);
    // Estaba presentado: la que sigue es la v3 en borrador, y la aprobación que esperaba ya no encuentra la v2.
    expect(version).toEqual({
      where: { id: "c1", estadoDocumento: "presentado", versionDocumento: 2 },
      data: { estadoDocumento: null, versionDocumento: 3 },
    });
    expect(db.hitoDeDocumento.create).toHaveBeenCalledWith({ data: expect.objectContaining({ canvasId: "c1", version: 3, tipo: "reabierto" }) });
  });
});
