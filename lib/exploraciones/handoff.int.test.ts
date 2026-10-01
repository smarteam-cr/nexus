/**
 * lib/exploraciones/handoff.int.test.ts — a qué proyecto le llega una exploración, contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/handoff.int.test.ts --project integration
 *
 * La regla (lib/exploraciones/handoff.ts): por el negocio de la propuesta; si no hay enlace, al
 * PRIMER proyecto de Customer Success que nace dentro de la ventana; nunca a uno de desarrollo o de
 * sitio web, ni a un ciclo posterior.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { exploracionDelProyecto } from "./handoff";

const CS = "826270797";
const DESARROLLO = "922785384";
const DIA = 24 * 60 * 60 * 1000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

async function cliente() {
  return prisma.client.create({ data: { name: "Prospecto de prueba", kind: "PROSPECTO", hubspotCompanyId: "999" }, select: { id: true } });
}

async function exploracion(clientId: string, creada: Date, tocada: Date, archivada = false) {
  return prisma.exploracionDeVenta.create({
    data: { clientId, creadaPor: "vendedor@prueba.test", areas: ["1"], createdAt: creada, updatedAt: tocada, archivadaEn: archivada ? tocada : null },
    select: { id: true },
  });
}

const proyecto = (clientId: string, nombre: string, pipeline: string | null, creado: Date, hubspotDealId: string | null = null) =>
  prisma.project.create({ data: { clientId, name: nombre, hubspotPipelineId: pipeline, createdAt: creado, hubspotDealId }, select: { id: true } });

describe("a qué proyecto le llega la exploración", () => {
  it("por el negocio de la propuesta, aunque haya otra exploración más nueva", async () => {
    const c = await cliente();
    // Una sola viva por empresa: la de la propuesta ya quedó archivada.
    const vieja = await exploracion(c.id, hace(200), hace(190), true);
    await exploracion(c.id, hace(10), hace(5));
    await prisma.businessCase.create({ data: { clientId: c.id, name: "Propuesta", slug: "p-1", hubspotDealId: "555", exploracionId: vieja.id } });
    const p = await proyecto(c.id, "Implementación", CS, hace(1), "555");
    expect(await exploracionDelProyecto(p.id)).toBe(vieja.id);
  });

  it("sin enlace: al primer proyecto de Customer Success de la ventana, no a un ciclo posterior", async () => {
    const c = await cliente();
    const e = await exploracion(c.id, hace(60), hace(30));
    // El contenedor de «Información del cliente» no es un proyecto: no le quita el lugar a nadie.
    await prisma.project.create({ data: { clientId: c.id, name: "Información del cliente", serviceType: "__strategy__", createdAt: hace(50) } });
    const primero = await proyecto(c.id, "Implementación", CS, hace(20));
    const segundo = await proyecto(c.id, "Segundo ciclo", CS, hace(10));
    expect(await exploracionDelProyecto(primero.id)).toBe(e.id);
    expect(await exploracionDelProyecto(segundo.id)).toBeNull();
  });

  it("nunca a un proyecto de desarrollo; y uno de desarrollo no le quita el lugar al de Customer Success", async () => {
    const c = await cliente();
    const e = await exploracion(c.id, hace(60), hace(30));
    const dev = await proyecto(c.id, "Integración", DESARROLLO, hace(25));
    const cs = await proyecto(c.id, "Implementación", CS, hace(20));
    expect(await exploracionDelProyecto(dev.id)).toBeNull();
    expect(await exploracionDelProyecto(cs.id)).toBe(e.id);
  });

  it("fuera de la ventana no: un proyecto de antes de la exploración, o de más de seis meses después", async () => {
    const c = await cliente();
    await exploracion(c.id, hace(400), hace(390));
    const tarde = await proyecto(c.id, "Mucho después", CS, hace(10));
    expect(await exploracionDelProyecto(tarde.id)).toBeNull();
    const c2 = await cliente();
    const antes = await proyecto(c2.id, "De antes", CS, hace(100));
    await exploracion(c2.id, hace(50), hace(40));
    expect(await exploracionDelProyecto(antes.id)).toBeNull();
  });
});
