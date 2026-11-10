/**
 * La preventa de una UNIDAD («Cemaco · Ecuador») nace en SU ficha y nunca abre la de la principal (invariante 1),
 * sin leer HubSpot: la empresa de HubSpot es de la principal (DECISIONS «Una empresa con varias unidades»).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const fichas: Record<string, { id: string; industry: string | null; comparteDominioConId: string | null }> = {
    "c-cr": { id: "c-cr", industry: "RETAIL", comparteDominioConId: null },
    "c-ec": { id: "c-ec", industry: null, comparteDominioConId: "c-cr" },
  };
  // Preventas vivas por ficha: la principal ya tiene la suya.
  const vivas: Record<string, string> = { "c-cr": "exp-cr" };
  const prisma = {
    client: { findUnique: vi.fn(async (a: { where: { id: string } }) => fichas[a.where.id] ?? null) },
    exploracionDeVenta: {
      findFirst: vi.fn(async (a: { where: { clientId: string } }) => (vivas[a.where.clientId] ? { id: vivas[a.where.clientId] } : null)),
      create: vi.fn(async (a: { data: { clientId: string } }) => ({ id: `nueva-de-${a.data.clientId}` })),
    },
  };
  return { prisma, vivas };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));
const hubspot = vi.hoisted(() => ({ leerEmpresa: vi.fn() }));
vi.mock("./hubspot", () => hubspot);
const puerta = vi.hoisted(() => ({ clienteDeLaEmpresaDeVentas: vi.fn() }));
vi.mock("@/lib/clients/cliente-de-la-empresa-de-ventas", () => puerta);
vi.mock("./servidor", () => ({ escalaParaExplorar: vi.fn(async () => ({ estado: "sin-escala" })) }));

import { abrirPreventaDeLaOpcion, crearExploracionDeLaUnidad } from "./crear";

describe("abrirPreventaDeLaOpcion — la bifurcación de POST /api/sales/exploraciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hubspot.leerEmpresa.mockResolvedValue({ id: "59033632123", nombre: "Cemaco Internacional", dominio: "cemaco.co.cr", industria: null });
    puerta.clienteDeLaEmpresaDeVentas.mockResolvedValue({ ok: true, clientId: "c-cr", creado: false });
  });

  it("la opción de una unidad abre SU ficha, no la de la principal", async () => {
    const r = await abrirPreventaDeLaOpcion({ clientId: "c-ec" }, "x@smarteam.cr");
    expect(r).toEqual({ ok: true, id: "nueva-de-c-ec", existia: false });
    expect(hubspot.leerEmpresa).not.toHaveBeenCalled();
  });

  it("la opción de la principal abre la de la principal por su empresa de HubSpot", async () => {
    const r = await abrirPreventaDeLaOpcion({ companyId: "59033632123" }, "x@smarteam.cr");
    expect(r).toEqual({ ok: true, id: "exp-cr", existia: true });
    expect(hubspot.leerEmpresa).toHaveBeenCalledWith("59033632123");
    expect(db.prisma.exploracionDeVenta.create).not.toHaveBeenCalled();
  });

  it("sin empresa ni unidad, 400", async () => {
    expect(await abrirPreventaDeLaOpcion({}, "x@smarteam.cr")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("crearExploracionDeLaUnidad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crea la preventa en la ficha de la unidad y no abre la de la principal", async () => {
    const r = await crearExploracionDeLaUnidad("c-ec", "ventas@smarteam.cr");
    expect(r).toEqual({ ok: true, id: "nueva-de-c-ec", existia: false });
    expect(db.prisma.exploracionDeVenta.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clientId: "c-ec" }) }));
    expect(db.prisma.exploracionDeVenta.create).toHaveBeenCalledTimes(1);
    expect(db.prisma.exploracionDeVenta.create.mock.calls[0][0].data.clientId).toBe("c-ec");
    // Nada pasa por la empresa de HubSpot ni por la puerta de Ventas: esas resuelven a la principal.
    expect(hubspot.leerEmpresa).not.toHaveBeenCalled();
    expect(puerta.clienteDeLaEmpresaDeVentas).not.toHaveBeenCalled();
  });

  it("si la unidad ya tiene la suya, abre esa", async () => {
    db.vivas["c-ec"] = "exp-ec";
    try {
      expect(await crearExploracionDeLaUnidad("c-ec", "x@smarteam.cr")).toEqual({ ok: true, id: "exp-ec", existia: true });
      expect(db.prisma.exploracionDeVenta.create).not.toHaveBeenCalled();
    } finally {
      delete db.vivas["c-ec"];
    }
  });

  it("una ficha que no es unidad no entra por esta puerta (va por su empresa de HubSpot)", async () => {
    const r = await crearExploracionDeLaUnidad("c-cr", "x@smarteam.cr");
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(db.prisma.exploracionDeVenta.findFirst).not.toHaveBeenCalled();
    expect(db.prisma.exploracionDeVenta.create).not.toHaveBeenCalled();
  });

  it("una ficha que no existe da 404", async () => {
    expect(await crearExploracionDeLaUnidad("no-existe", "x@smarteam.cr")).toMatchObject({ ok: false, status: 404 });
  });
});
