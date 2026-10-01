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
/* En la base de prueba una corrida termina en milisegundos (no hay HubSpot ni IA); en producción tarda
   decenas de segundos. Sin esta demora, la prueba de «una a la vez» dependería de los tiempos. */
vi.mock("./fuentes", async (original) => {
  const real = await original<typeof import("./fuentes")>();
  return {
    ...real,
    leerFuentes: async (...args: Parameters<typeof real.leerFuentes>) => {
      await new Promise((r) => setTimeout(r, 700));
      return real.leerFuentes(...args);
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { AGENTE_DE_LA_EXPLORACION, lanzarCorrida, leerReunionNueva } from "./agente";
import { leerPropuesta } from "./esquemas";
import { aplicarCambios } from "./servidor";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

async function sembrar(creadaHaceHoras: number, o: { kind?: "PROSPECTO" | "CLIENTE"; archivada?: boolean } = {}) {
  // La escala publicada, una vez por caso (hay casos que siembran dos empresas).
  await prisma.escalaDocumento.upsert({
    where: { documento_version: { documento: "escala", version: general.version } },
    update: {},
    create: {
      documento: "escala",
      version: general.version,
      escalaVersion: general.version,
      archivo: "escala_rendimiento_smarteam.md",
      texto,
      huella: createHash("sha256").update(texto).digest("hex"),
    },
  });
  const c = await prisma.client.create({ data: { name: "Prospecto de prueba", kind: o.kind ?? "PROSPECTO", hubspotCompanyId: "999" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      areas: ["1"],
      perfilCierre: "con equipo",
      perfilDespues: "continua",
      createdAt: new Date(Date.now() - creadaHaceHoras * 60 * 60 * 1000),
      ...(o.archivada ? { archivadaEn: new Date() } : {}),
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
    // Las dos llegan juntas: la fila bloqueada hace que una lance y la otra encuentre la corrida viva.
    const resultados = await Promise.all([
      leerReunionNueva({ sesionId: "ses-1", fecha, clientId }),
      leerReunionNueva({ sesionId: "ses-2", fecha, clientId }),
    ]);
    expect([...resultados].sort()).toEqual(["lanzada", "ya-corre"]);

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

describe("los frenos del agente", () => {
  it("una corrida que quedó en RUNNING sin dar señales no traba: se cierra con su motivo y se lanza otra", async () => {
    const { clientId, id } = await sembrar(24);
    const muerta = await prisma.agentRun.create({
      data: {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        clientId,
        status: "RUNNING",
        filters: { exploracionId: id, modo: "leer" },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    const r = await lanzarCorrida(id, "leer", { triggeredByEmail: "vendedor@prueba.test" });
    expect(r).toMatchObject({ ok: true, yaCorria: false });
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: muerta.id } })).status).toBe("ERROR");
    await esperarQueTermine(clientId);
  });

  it("una exploración archivada no se cambia ni pone a trabajar al agente", async () => {
    const { id } = await sembrar(24, { archivada: true });
    expect(await lanzarCorrida(id, "preparar", { triggeredByEmail: null })).toMatchObject({ ok: false, status: 409 });
    const r = await aplicarCambios(id, 0, [{ op: "nota", paso: "r1-test", texto: "x" }], general);
    expect(r.estado).toBe("invalido");
  });

  it("la lectura automática se detiene cuando la venta ya tiene un proyecto, y no corre para un cliente", async () => {
    const { clientId } = await sembrar(48);
    await prisma.project.create({ data: { clientId, name: "Implementación", createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
    expect(await leerReunionNueva({ sesionId: "ses-1", fecha: new Date(Date.now() - 30 * 60 * 1000), clientId })).toBe("no-corresponde");

    const cliente = await sembrar(24, { kind: "CLIENTE" });
    expect(await leerReunionNueva({ sesionId: "ses-2", fecha: new Date(Date.now() - 30 * 60 * 1000), clientId: cliente.clientId })).toBe("no-corresponde");
    expect(await prisma.agentRun.count({ where: { agentSlug: AGENTE_DE_LA_EXPLORACION } })).toBe(0);
  });
});
