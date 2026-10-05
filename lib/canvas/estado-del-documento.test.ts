import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aColumna,
  aprobacionEnElEnlace,
  evidenciaDelEnlace,
  TEXTO_DE_APROBACION_DEL_CLIENTE,
  leerEstado,
  lineaDelDocumento,
  notaDeAprobacion,
  revisarParaPresentar,
  validarAprobacion,
} from "./estado-del-documento";
import { registrarAprobacion, trasRegenerar } from "./estado-del-documento-servidor";
import type { CaboSuelto } from "./revisar-hilo";

// La parte que ESCRIBE (estado-del-documento-servidor.ts), con la base y HubSpot falsos. Lo puro de
// arriba no los usa.
const db = vi.hoisted(() => ({
  projectCanvas: { findUnique: vi.fn(), updateMany: vi.fn() },
  hitoDeDocumento: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const hubspot = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn(async () => {}) }));
vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: async () => hubspot }));
vi.mock("./versiones", () => ({
  fotoDelDocumento: vi.fn(async () => ({ secciones: [] })),
  guardarVersionDelDocumento: vi.fn(),
  huellaDe: () => "huella-presentada",
  tieneContenido: () => true,
}));

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
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [aviso], politica: POLITICA_REVISADA })).toEqual({ ok: true, motivos: [] });
  });

  it("no se presenta con un cabo suelto, con la política sin revisar, ni sin política: junta TODOS los motivos", () => {
    const r = revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [roto], politica: { ...POLITICA_REVISADA, revisadaAt: "" } });
    expect(r.ok).toBe(false);
    expect(r.motivos).toHaveLength(2);
    expect(r.motivos[0]).toContain("La causa F2 no tiene ninguna acción");
    expect(r.motivos[1]).toContain("sugerencia de la IA");
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: true, cabos: [], politica: undefined }).motivos[0]).toContain("Falta la política rectora");
  });

  it("aprobado no se presenta (está cerrado), y sin contenido no hay nada que presentar", () => {
    expect(revisarParaPresentar({ estado: "aprobado", tieneContenido: true, cabos: [], politica: POLITICA_REVISADA }).motivos[0]).toContain("reábrelo");
    expect(revisarParaPresentar({ estado: "borrador", tieneContenido: false, cabos: [], politica: POLITICA_REVISADA }).motivos[0]).toContain("genera el diagnóstico");
  });

  it("la aprobación pide quién, cuándo (no futuro) y la evidencia", () => {
    const hoy = new Date("2026-10-02T15:00:00.000Z");
    const base = { nombre: "Pablo Olivas", email: "pablo@cliente.cr", fecha: "2026-10-02", evidencia: "Aprobado, sigamos." };
    expect(validarAprobacion(base, hoy).ok).toBe(true);
    expect(validarAprobacion({ ...base, nombre: " " }, hoy)).toEqual({ ok: false, error: "Falta quién aprobó del lado del cliente." });
    expect(validarAprobacion({ ...base, email: "no-es-correo" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, fecha: "2026-12-01" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, evidencia: "" }, hoy).ok).toBe(false);
    expect(validarAprobacion({ ...base, evidencia: "", evidenciaDocumentoId: "doc1" }, hoy).ok).toBe(true);
  });

  it("la línea de la portada sigue a FUNDAUNA", () => {
    const l = lineaDelDocumento({ cliente: "FUNDAUNA", fecha: new Date("2026-09-24T18:00:00.000Z"), version: 1, estado: "borrador" });
    expect(l).toBe("Cliente: FUNDAUNA · Fecha: 24 de septiembre de 2026 · Versión: v1 · Estado: Borrador");
  });

  it("la nota de HubSpot escapa el HTML de la evidencia", () => {
    const n = notaDeAprobacion({
      documento: "Diagnóstico",
      version: 2,
      nombre: "Pablo",
      email: "",
      fecha: new Date("2026-10-02T12:00:00.000Z"),
      evidencia: "<script>x</script>\nOK",
      registradoPor: "cse@smarteamcr.com",
    });
    expect(n).toContain("Diagnóstico v2 aprobado por el cliente.");
    expect(n).toContain("&lt;script&gt;");
    expect(n).not.toContain("<script>");
  });
});

describe("el cliente aprueba desde su enlace", () => {
  const presentadaV2 = { tipo: "presentado", version: 2, aprobadoPorNombre: null, aprobadoEl: null };

  it("puede aprobar lo que ve si es lo vigente: presentado, la misma versión y sin cambios", () => {
    expect(
      aprobacionEnElEnlace({ vista: presentadaV2, vivo: { estado: "presentado", version: 2, cambiosDesdeLaPresentacion: false } }),
    ).toEqual({ estado: "por-aprobar" });
  });

  it("si el equipo ya está ajustando, espera la versión nueva", () => {
    // Regeneró después de presentar: borrador v3.
    expect(aprobacionEnElEnlace({ vista: presentadaV2, vivo: { estado: "borrador", version: 3, cambiosDesdeLaPresentacion: false } }))
      .toEqual({ estado: "en-revision" });
    // Editó a mano lo presentado.
    expect(aprobacionEnElEnlace({ vista: presentadaV2, vivo: { estado: "presentado", version: 2, cambiosDesdeLaPresentacion: true } }))
      .toEqual({ estado: "en-revision" });
    // Sin estado vivo legible.
    expect(aprobacionEnElEnlace({ vista: presentadaV2, vivo: null })).toEqual({ estado: "en-revision" });
  });

  it("nunca aprueba una versión que no es la que ve", () => {
    expect(aprobacionEnElEnlace({ vista: presentadaV2, vivo: { estado: "presentado", version: 3, cambiosDesdeLaPresentacion: false } }))
      .toEqual({ estado: "en-revision" });
  });

  it("lo aprobado se muestra aprobado, con quién y cuándo, aunque después se haya reabierto", () => {
    const vista = { tipo: "aprobado", version: 2, aprobadoPorNombre: " Ana Pérez ", aprobadoEl: new Date("2026-10-04T12:00:00Z") };
    expect(aprobacionEnElEnlace({ vista, vivo: { estado: "borrador", version: 3, cambiosDesdeLaPresentacion: false } })).toEqual({
      estado: "aprobado",
      nombre: "Ana Pérez",
      fecha: "2026-10-04T12:00:00.000Z",
    });
  });

  it("la evidencia dice que fue desde el enlace, quién y lo que aceptó", () => {
    const e = evidenciaDelEnlace("Ana Pérez", "ana@cliente.com");
    expect(e).toContain("desde su enlace de Nexus");
    expect(e).toContain("Ana Pérez (ana@cliente.com)");
    expect(e).toContain(TEXTO_DE_APROBACION_DEL_CLIENTE);
    // Y alcanza como evidencia para registrar la aprobación.
    expect(validarAprobacion({ nombre: "Ana Pérez", email: "ana@cliente.com", fecha: "2026-10-04", evidencia: e }, new Date("2026-10-04T15:00:00Z")).ok).toBe(true);
  });
});

describe("registrar la aprobación (lo que escribe)", () => {
  const HOY = new Date().toISOString().slice(0, 10);
  const datos = { nombre: "Ana Pérez", email: "ana@cliente.com", fecha: HOY, evidencia: "Aprobado desde el enlace.", evidenciaDocumentoId: null };
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

  it("no aprueba una versión que no es la que tiene a la vista quien aprueba: 409 y no escribe nada", async () => {
    /* El cliente abrió el enlace con la v1 presentada; el equipo presentó la v2. Lo que lo pone en
       rojo: que `registrarAprobacion` deje de comparar la versión esperada con la viva. */
    const r = await registrarAprobacion("c1", datos, null, 1);
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "otra-version" });
    expect(db.projectCanvas.updateMany).not.toHaveBeenCalled();
    expect(db.hitoDeDocumento.create).not.toHaveBeenCalled();
    expect(hubspot.apiRequest).not.toHaveBeenCalled();
  });

  it("toma el documento ANTES de escribir afuera: si otra aprobación se adelantó, 409 con quién aprobó de verdad y sin nota en HubSpot", async () => {
    /* Doble clic, o el equipo y el cliente a la vez: los dos leyeron «presentado». Lo que lo pone en
       rojo: volver a cambiar el estado sin condición, o seguir aunque el cambio condicional no tomó la fila. */
    db.projectCanvas.updateMany.mockResolvedValue({ count: 0 });
    db.projectCanvas.findUnique.mockResolvedValueOnce(documento()).mockResolvedValue(documento({ estadoDocumento: "aprobado" }));
    const r = await registrarAprobacion("c1", datos, null, 2);
    expect(db.projectCanvas.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", estadoDocumento: "presentado", versionDocumento: 2 },
      data: { estadoDocumento: "aprobado" },
    });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      codigo: "ya-aprobado",
      aprobado: { nombre: "Pablo Olivas", fecha: "2026-10-03T12:00:00.000Z" },
    });
    expect(db.hitoDeDocumento.create).not.toHaveBeenCalled();
    expect(hubspot.apiRequest).not.toHaveBeenCalled();
  });

  it("cuando toma el documento, deja el hito y DESPUÉS escribe la nota en HubSpot y la anota en el hito", async () => {
    const r = await registrarAprobacion("c1", datos, null, 2);
    expect(r.ok).toBe(true);
    expect(db.projectCanvas.updateMany.mock.invocationCallOrder[0]).toBeLessThan(hubspot.apiRequest.mock.invocationCallOrder[0]);
    expect(db.hitoDeDocumento.update).toHaveBeenCalledWith({ where: { id: "hito-nuevo" }, data: { hubspotNotaId: "nota-1", hubspotError: null } });
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
