/**
 * lib/exploraciones/agente-preparar.int.test.ts — lo que la preparación deja hecho SOLA, contra una
 * base REAL: la industria y su perfil habitual, el área del test y el país y el tamaño de la empresa.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/agente-preparar.int.test.ts --project integration
 *
 * Es la única escritura del agente en lo confirmado (pedido de Elías, 2026-10-01), y por eso lo que
 * más hay que cuidar: que suba la versión (la pantalla del vendedor recarga en vez de pisar), que
 * nunca toque una industria que eligió el vendedor y que no reemplace lo que ya estaba. Sin HubSpot ni
 * Claude: las fuentes y las respuestas son de mentira.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/* Lo que «leyó» de HubSpot: la ficha de la empresa y el test de Ventas de un contacto. */
vi.mock("./fuentes", () => ({
  leerFuentes: async () => ({
    fuentes: [{ id: "E0", etiqueta: "La empresa en HubSpot", texto: "Nombre: Crédito Ágil\nIndustria en HubSpot: COMPUTER_SOFTWARE\nDescripción: Financiera que coloca créditos a pymes." }],
    tests: [{ contacto: "Ana", resultado: { areaId: "1", fecha: "2026-09-26", url: "https://x/#y", respuestas: [] } }],
    agenda: [],
    correosSinPermiso: 0,
    leidas: { sesiones: [], hubspot: [] },
    sesionesUsadas: [],
    empresa: { pais: "Costa Rica", empleados: "120" },
  }),
}));

/* Claude: elige «banca» para la industria y no propone nada en la preparación. */
const pedidos: string[] = [];
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (p: { tools: { name: string }[] }) => {
        const herramienta = p.tools[0].name;
        pedidos.push(herramienta);
        const input =
          herramienta === "elegir_industria"
            ? { edicion: "banca", razon: "Es una financiera que coloca créditos a pymes." }
            : { textos: [], metas: [], retos: [], personas: [], areas: [] };
        return { content: [{ type: "tool_use", id: "tu", name: herramienta, input }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { AGENTE_DE_LA_EXPLORACION, lanzarCorrida } from "./agente";
import { leerContenido } from "./esquemas";

const texto = leerArchivoDeLaEscala("escala");
const general = parsearEscala(texto);

async function sembrar(o: { contenido?: object; edicion?: string | null; perfil?: [string, string] } = {}) {
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
  const c = await prisma.client.create({ data: { name: "Crédito Ágil", kind: "PROSPECTO", hubspotCompanyId: "777" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({
    data: {
      clientId: c.id,
      creadaPor: "vendedor@prueba.test",
      edicion: o.edicion ?? null,
      perfilCierre: o.perfil?.[0] ?? null,
      perfilDespues: o.perfil?.[1] ?? null,
      ...(o.contenido ? { contenido: o.contenido } : {}),
    },
    select: { id: true },
  });
  return { clientId: c.id, id: e.id };
}

async function prepararYEsperar(id: string, clientId: string) {
  const r = await lanzarCorrida(id, "preparar", { triggeredByEmail: "vendedor@prueba.test" });
  expect(r.ok).toBe(true);
  for (let i = 0; i < 100; i++) {
    const run = await prisma.agentRun.findFirst({ where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION }, orderBy: { createdAt: "desc" } });
    if (run && run.status !== "RUNNING") return run;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("la corrida no terminó");
}

describe("lo que la preparación deja hecho sola", () => {
  it("elige la industria con su perfil habitual, suma el área del test y los datos de la empresa, y sube la versión", async () => {
    const { clientId, id } = await sembrar();
    const run = await prepararYEsperar(id, clientId);
    expect(run.status).toBe("DONE");
    expect(pedidos).toContain("elegir_industria");

    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id } });
    const habitual = general.ediciones.find((e) => e.slug === "banca")?.perfilHabitual;
    expect([fila.edicion, fila.perfilCierre, fila.perfilDespues]).toEqual(["banca", habitual?.cierre, habitual?.despues]);
    expect(fila.areas).toEqual(["1"]);
    expect(fila.version).toBe(1);
    const c = leerContenido(fila.contenido);
    const razon = "Es una financiera que coloca créditos a pymes.";
    expect(c.edicionElegida).toEqual({
      por: "agente",
      razon,
      sugerida: { edicion: "banca", cierre: habitual?.cierre ?? null, despues: habitual?.despues ?? null, por: "agente", razon },
    });
    expect(c.medicion).toEqual({ pais: "Costa Rica", personasEmpresa: "120" });
    expect(c.razonesDeAreas["1"]).toMatch(/test/);
  });

  it("⛔ lo que eligió el vendedor no se toca: ni la industria ni el perfil ni lo que ya estaba (la sugerida sí se guarda, para «Restablecer»)", async () => {
    const { clientId, id } = await sembrar({
      edicion: null,
      perfil: ["con equipo", "única"],
      contenido: { version: 1, edicionElegida: { por: "vendedor" }, medicion: { pais: "Panamá" } },
    });
    pedidos.length = 0;
    await prepararYEsperar(id, clientId);
    // Sin sugerida guardada, se le pregunta al agente una vez: para poder volver a ella.
    expect(pedidos).toContain("elegir_industria");
    const fila = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id } });
    expect([fila.edicion, fila.perfilCierre, fila.perfilDespues]).toEqual([null, "con equipo", "única"]);
    const c = leerContenido(fila.contenido);
    expect(c.edicionElegida?.por).toBe("vendedor");
    expect(c.edicionElegida?.sugerida?.edicion).toBe("banca");
    // Lo vacío se completa; lo que había, no.
    expect(c.medicion).toEqual({ pais: "Panamá", personasEmpresa: "120" });
  });

  it("⛔ en una exploración de antes, que no anotaba quién eligió, una industria ya puesta es del vendedor", async () => {
    const { clientId, id } = await sembrar({ edicion: "educacion" });
    pedidos.length = 0;
    await prepararYEsperar(id, clientId);
    expect((await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id } })).edicion).toBe("educacion");
  });

  it("con la sugerida ya guardada, la elección del vendedor no le vuelve a preguntar al agente", async () => {
    const { clientId, id } = await sembrar({
      edicion: "educacion",
      contenido: { version: 1, edicionElegida: { por: "vendedor", sugerida: { edicion: "banca", cierre: null, despues: null, por: "agente" } } },
    });
    pedidos.length = 0;
    await prepararYEsperar(id, clientId);
    expect(pedidos).not.toContain("elegir_industria");
    expect((await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id } })).edicion).toBe("educacion");
  });
});
