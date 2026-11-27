/**
 * lib/sessions/reparto-de-la-empresa.test.ts — lo de HubSpot de una empresa, a su unidad (2026-11-26).
 *
 * Correr: `npx vitest run lib/sessions/reparto-de-la-empresa.test.ts --project unit`.
 */
import { describe, expect, it, vi } from "vitest";
import type { CategorizeContext } from "./categorize";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./resolve-client", () => ({ buildCategorizeCtx: vi.fn() }));

const { repartoCon, SIN_REPARTO } = await import("./reparto-de-la-empresa-server");

const TEC = { id: "tec", name: "TEC", company: null, emailDomains: ["itcr.ac.cr"], kind: "EMPRESA" };
const TAE = { id: "tae", name: "TEC · TAE", company: null, emailDomains: [], siglas: ["TAE"], comparteDominioConId: "tec", kind: "CLIENTE" };
const AE = { id: "ae", name: "TEC · AE", company: null, emailDomains: [], siglas: ["AE"], comparteDominioConId: "tec", kind: "CLIENTE" };
const OTRO = { id: "otro", name: "Wherex", company: null, emailDomains: ["wherex.com"], kind: "CLIENTE" };

const ctx = (clients: CategorizeContext["clients"]): CategorizeContext => ({
  clients,
  categories: [],
  hubspotCompaniesByDomain: new Map(),
  internalDomains: new Set(["smarteamcr.com"]),
  interlocutoresConfirmados: new Map([["ivania@itcr.ac.cr", ["ae"]]]),
});

describe("el reparto", () => {
  const r = repartoCon(ctx([TEC, TAE, AE, OTRO]));

  it("sabe cuáles son empresas y sus unidades", () => {
    expect(r.esEmpresa("tec")).toBe(true);
    expect(r.esEmpresa("tae")).toBe(false);
    expect(r.unidadesDe("tec")).toEqual(["tae", "ae"]);
  });

  it("cada fila va a su unidad; sin pista, se queda en la empresa; una ficha normal, en ella", () => {
    expect(r.destino("tec", { titulo: null, correos: ["Ivania@itcr.ac.cr"] })).toBe("ae");
    expect(r.destino("tec", { titulo: "TAE | Reporte", correos: [] })).toBe("tae");
    expect(r.destino("tec", { titulo: "Hola", correos: ["nadie@itcr.ac.cr"] })).toBe("tec");
    expect(r.destino("otro", { titulo: "AE | x", correos: [] })).toBe("otro");
  });

  it("la empresa y sus unidades cuentan como leídas juntas: una fila que cambia de unidad se da de baja en la vieja", () => {
    const m = r.conSusUnidades(new Map([["59180429929", ["tec"]], ["123", ["otro"]]]));
    expect(m.get("59180429929")).toEqual(["tec", "tae", "ae"]);
    expect(m.get("123")).toEqual(["otro"]);
  });

  it("sin empresas en la base, no reparte nada", () => {
    expect(repartoCon(ctx([TAE, OTRO]))).toBe(SIN_REPARTO);
    expect(SIN_REPARTO.destino("x", { titulo: "AE", correos: [] })).toBe("x");
  });
});

describe("lo que la revisión del 26 nov sumó al reparto", () => {
  const r = repartoCon(ctx([TEC, TAE, AE, OTRO]));

  it("dos fichas de la misma empresa son esa empresa; de dos empresas, ninguna", () => {
    expect(r.empresaComun(["tec", "ae"])).toBe("tec");
    expect(r.empresaComun(["tae", "ae"])).toBe("tec");
    expect(r.empresaComun(["ae", "otro"])).toBeNull();
    expect(r.empresaComun(["otro"])).toBeNull();
  });

  it("una venta que ya es de una unidad no se mueve; una que espera en la empresa, sí se reparte", () => {
    expect(r.destinoSinMoverLoRepartido("tec", "tae", { titulo: "AE | Renovación", correos: [] })).toBe("tae");
    expect(r.destinoSinMoverLoRepartido("tec", "tec", { titulo: "AE | Renovación", correos: [] })).toBe("ae");
    expect(r.destinoSinMoverLoRepartido("tec", null, { titulo: "Renovación", correos: [] })).toBe("tec");
  });

  it("si la base falla por otra cosa que el SQL sin aplicar, la copia no sigue sin reparto", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const { cargarRepartoDeEmpresas } = await import("./reparto-de-la-empresa-server");
    (prisma as unknown as { client: unknown }).client = { count: async () => { throw new Error("Connection terminated"); } };
    await expect(cargarRepartoDeEmpresas()).rejects.toThrow(/Connection/);
    (prisma as unknown as { client: unknown }).client = { count: async () => { throw new Error('invalid input value for enum "ClientKind": "EMPRESA"'); } };
    await expect(cargarRepartoDeEmpresas()).resolves.toBe(SIN_REPARTO);
  });
});
