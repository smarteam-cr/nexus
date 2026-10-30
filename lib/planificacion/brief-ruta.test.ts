/**
 * lib/planificacion/brief-ruta.test.ts — traer la hoja: con la cuenta de QUIEN LA PIDE, y con sus errores en palabras
 * (2026-10-29, lo que pidió la revisión). Drive y la base van simulados: lo real lo prueba el equipo con una hoja de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const m = vi.hoisted(() => ({
  exportar: vi.fn(),
  guard: vi.fn(),
  email: vi.fn(),
  guardar: vi.fn(),
  cliente: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/google/drive-files", async (original) => ({
  ...(await original<typeof import("@/lib/google/drive-files")>()),
  exportarHojaDeCalculo: m.exportar,
}));
vi.mock("@/lib/auth/api-guards", () => ({ guardAccessToProject: m.guard }));
vi.mock("@/lib/agents/triggered-by", () => ({ triggeredByEmail: m.email }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { client: { findUnique: m.cliente } } }));
vi.mock("./brief-importado-server", async (original) => ({
  ...(await original<typeof import("./brief-importado-server")>()),
  guardarBriefEnLaPlanificacion: m.guardar,
}));

import ExcelJS from "exceljs";
import { POST } from "@/app/api/projects/[projectId]/planificacion/brief/route";
import { DriveFileError } from "@/lib/google/drive-files";

const PROYECTO = "cmv5d646800gk07qlo8tydjui";
const ENLACE = "https://docs.google.com/spreadsheets/d/abc123/edit";

async function hoja(titulo = "Brief Agro"): Promise<{ title: string; xlsx: Buffer }> {
  const l = new ExcelJS.Workbook();
  l.addWorksheet("Usuarios").getCell("A1").value = "Ana";
  return { title: titulo, xlsx: Buffer.from(await l.xlsx.writeBuffer()) };
}

const pedir = (url: unknown = ENLACE, confirmado?: boolean) =>
  POST(new Request("http://x/y", { method: "POST", body: JSON.stringify({ url, confirmado }) }) as never, { params: Promise.resolve({ projectId: PROYECTO }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue({ clientId: "c1" });
  m.email.mockResolvedValue("ana@smarteamcr.com");
  m.cliente.mockResolvedValue({ name: "Agro" });
  m.guardar.mockResolvedValue({ canvasId: "x", creoLaPlanificacion: false });
});

describe("POST …/planificacion/brief", () => {
  it("⛔ lee la hoja con la cuenta de quien la pide, y esa queda como quien la trajo", async () => {
    m.exportar.mockResolvedValue(await hoja());
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(m.exportar).toHaveBeenCalledWith("ana@smarteamcr.com", "abc123");
    expect(m.guardar.mock.calls[0][1].importadoPor).toBe("ana@smarteamcr.com");
    expect((await r.json()).titulo).toBe("Brief Agro");
  });

  it("sin saber quién pide no lee nada", async () => {
    m.email.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
    expect(m.exportar).not.toHaveBeenCalled();
  });

  it("sin acceso al proyecto no lee nada", async () => {
    m.guard.mockResolvedValue(NextResponse.json({}, { status: 403 }));
    expect((await pedir()).status).toBe(403);
    expect(m.exportar).not.toHaveBeenCalled();
  });

  it("un enlace que no es de una hoja no llega a Drive", async () => {
    expect((await pedir("https://docs.google.com/document/d/abc/edit")).status).toBe(400);
    expect((await pedir("no es un enlace")).status).toBe(400);
    expect(m.exportar).not.toHaveBeenCalled();
  });

  it("sin acceso a la hoja lo dice, y no guarda", async () => {
    m.exportar.mockRejectedValue(new DriveFileError("NO_ACCESS", "Sin acceso"));
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/Tu cuenta no puede abrir/);
    expect(m.guardar).not.toHaveBeenCalled();
  });

  it("⛔ una hoja que no nombra al cliente no se guarda hasta que alguien lo confirme", async () => {
    m.exportar.mockResolvedValue(await hoja("Brief de otra empresa"));
    const r = await pedir();
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.confirmar).toBe(true);
    expect(j.error).toMatch(/no nombra a Agro/);
    expect(m.guardar).not.toHaveBeenCalled();
    expect((await pedir(ENLACE, true)).status).toBe(200);
    expect(m.guardar).toHaveBeenCalledTimes(1);
  });
});
