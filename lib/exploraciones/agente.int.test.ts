/**
 * lib/exploraciones/agente.int.test.ts — la lectura AUTOMÁTICA de una reunión, contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/agente.int.test.ts --project integration
 *
 * Lo que solo una base prueba: que la reunión que llega dispara UNA corrida (marcada automática y
 * sin persona, para el presupuesto automático), que una segunda llegada mientras corre no lanza otra,
 * que la corrida termina y deja su historia, y que una reunión de antes del alta no dispara nada.
 * Sin HubSpot (la base de prueba no tiene la cuenta del sistema) y sin reuniones, el agente no tiene
 * nada que leer: termina sin llamar al modelo.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { AGENTE_DE_LA_EXPLORACION, leerReunionNueva } from "./agente";
import { leerPropuesta } from "./esquemas";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

async function sembrar(creadaHaceHoras: number) {
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
  const c = await prisma.client.create({ data: { name: "Prospecto de prueba", kind: "PROSPECTO", hubspotCompanyId: "999" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      perfilCierre: "con equipo",
      perfilDespues: "continua",
      createdAt: new Date(Date.now() - creadaHaceHoras * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  return { clientId: c.id, id: e.id };
}

async function esperarQueTermine(clientId: string) {
  for (let i = 0; i < 100; i++) {
    const r = await prisma.agentRun.findFirst({ where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION }, orderBy: { createdAt: "desc" } });
    if (r && r.status !== "RUNNING") return r;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("la corrida no terminó");
}

describe("la reunión que llega se lee sola", () => {
  it("lanza UNA corrida automática; una segunda llegada mientras corre no lanza otra", async () => {
    const { clientId, id } = await sembrar(24);
    const fecha = new Date(Date.now() - 60 * 60 * 1000);
    expect(await leerReunionNueva({ sesionId: "ses-1", fecha, clientId })).toBe("lanzada");
    expect(await leerReunionNueva({ sesionId: "ses-2", fecha, clientId })).toBe("ya-corre");

    const run = await esperarQueTermine(clientId);
    expect(run.status).toBe("DONE");
    expect(run.triggeredByEmail).toBeNull();
    expect(run.filters).toMatchObject({ exploracionId: id, modo: "leer", automatica: true });
    expect(JSON.parse(run.output ?? "{}")).toMatchObject({ propuestos: 0, nadaNuevo: true });
    expect(await prisma.agentRun.count({ where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION } })).toBe(1);

    // La historia queda en la exploración, marcada como automática.
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id }, select: { propuesta: true } });
    expect(leerPropuesta(fila.propuesta).corridas).toMatchObject([{ id: run.id, modo: "leer", propuestos: 0, automatica: true }]);
  });

  it("una reunión de antes del alta, o sin exploración viva, no dispara nada", async () => {
    const { clientId } = await sembrar(1);
    expect(await leerReunionNueva({ sesionId: "ses-1", fecha: new Date(Date.now() - 3 * 60 * 60 * 1000), clientId })).toBe("no-corresponde");
    const otro = await prisma.client.create({ data: { name: "Sin exploración", kind: "PROSPECTO" }, select: { id: true } });
    expect(await leerReunionNueva({ sesionId: "ses-9", fecha: new Date(), clientId: otro.id })).toBe("no-corresponde");
    expect(await prisma.agentRun.count({ where: { agentSlug: AGENTE_DE_LA_EXPLORACION } })).toBe(0);
  });
});
