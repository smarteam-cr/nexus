/**
 * lib/exploraciones/propuesta.int.test.ts — armar la Propuesta de Nexus desde la exploración,
 * contra una base REAL (HubSpot simulado: solo responde los negocios de la empresa).
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/propuesta.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que la propuesta nace enlazada a la exploración y al negocio, con su
 * Plantilla (v0) y los casos de uso elegidos marcados, todo en una transacción; que la foto de
 * «lista para proponer» queda en la exploración sin subirle la versión; y que un negocio de otra
 * empresa no se acepta.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/hubspot/client", () => ({
  getSystemHubspotClient: async () => ({}),
  forceRefreshSystemToken: async () => {},
  tokenDeCuenta: (c: { accessToken: string }) => c.accessToken,
}));
vi.mock("@/lib/hubspot/deals", () => ({
  fetchCompanyDeals: async () => [
    { id: "555", name: "Implementación", amount: null, closedate: null, isWon: false, isClosed: false, pipeline: "Ventas", stage: "Propuesta" },
  ],
}));

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { leerContenido } from "./esquemas";
import { armarPropuesta } from "./propuesta";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

async function sembrar() {
  await prisma.escalaDocumento.create({
    data: {
      documento: "escala",
      version: general.version,
      escalaVersion: general.version,
      archivo: "escala_rendimiento_smarteam.md",
      texto,
      huella: createHash("sha256").update(texto).digest("hex"),
    },
  });
  const uc = await prisma.useCase.create({ data: { title: "Pipeline de ventas", description: "Etapas definidas", price: "USD 1.200" }, select: { id: true } });
  const c = await prisma.client.create({ data: { name: "Prospecto de prueba", kind: "PROSPECTO", hubspotCompanyId: "999" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      perfilCierre: "con equipo",
      perfilDespues: "continua",
      version: 4,
      contenido: {
        casillas: { metas: [{ que: "Subir la tasa de cierre", actual: "2 de 10", objetivo: "4 de 10", para: "junio" }] },
        casosDeUso: { [uc.id]: { titulo: "Pipeline de ventas", areaId: "1" }, "ya-no-existe": { titulo: "Viejo", areaId: "1" } },
      },
    },
    select: { id: true },
  });
  return { clientId: c.id, id: e.id, useCaseId: uc.id };
}

describe("armar la propuesta desde la exploración", () => {
  it("nace enlazada a la exploración y al negocio, con su Plantilla y los casos de uso elegidos", async () => {
    const { clientId, id, useCaseId } = await sembrar();
    const r = await armarPropuesta({ exploracionId: id, dealId: "555", nombre: null, email: "vendedor@prueba.test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const bc = await prisma.businessCase.findUniqueOrThrow({ where: { id: r.businessCaseId } });
    expect(bc).toMatchObject({ clientId, exploracionId: id, hubspotDealId: "555", hubspotCompanyId: "999", caseType: "hubspot_implementation", name: "Propuesta — Prospecto de prueba" });
    expect(await prisma.projectCanvas.count({ where: { businessCaseId: bc.id, version: 0 } })).toBe(1);
    // Solo los casos que siguen en el catálogo.
    const pivotes = await prisma.businessCaseUseCase.findMany({ where: { businessCaseId: bc.id } });
    expect(pivotes.map((p) => [p.useCaseId, p.selected])).toEqual([[useCaseId, true]]);

    // La foto de «lista para proponer», sin subir la versión de la exploración.
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id }, select: { contenido: true, version: true } });
    expect(fila.version).toBe(4);
    const fotos = leerContenido(fila.contenido).alProponer;
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toMatchObject({ businessCaseId: bc.id, puntos: { meta: true, dimensiones: false } });
  });

  it("un negocio que no es de la empresa no se acepta, y no queda nada a medias", async () => {
    const { id } = await sembrar();
    const r = await armarPropuesta({ exploracionId: id, dealId: "777", nombre: "X", email: null });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(await prisma.businessCase.count()).toBe(0);
  });
});
