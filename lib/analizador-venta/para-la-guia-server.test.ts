/**
 * lib/analizador-venta/para-la-guia-server.test.ts — las dos lecturas que miran reuniones de la empresa (2026-11-08):
 * los insumos para la guía y lo que ya se sabía de sesiones anteriores. ⛔ Invariante 1: las reuniones salen del
 * chokepoint con la empresa pedida y el análisis se busca con ESA empresa; un análisis de otra no entra aunque el id de
 * la reunión coincida. Llama a las funciones con Prisma y el chokepoint de mentira: lo que se afirma es lo que devuelven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const estado = {
    reuniones: [] as { id: string; title: string; date: number }[],
    filas: [] as { sessionId: string; clientId: string; estado: string; resultado: unknown }[],
    pedidos: [] as { clientId: string; opts: unknown }[],
  };
  const prisma = {
    analisisDeVenta: {
      findMany: vi.fn(async (args: { where: { sessionId: { in: string[] }; clientId: string; estado: string } }) =>
        estado.filas.filter((f) => args.where.sessionId.in.includes(f.sessionId) && f.clientId === args.where.clientId && f.estado === args.where.estado),
      ),
    },
  };
  const getClientSessions = vi.fn(async (clientId: string, opts: { before?: Date } = {}) => {
    estado.pedidos.push({ clientId, opts });
    return estado.reuniones.filter((r) => !opts.before || r.date <= opts.before.getTime());
  });
  return { estado, prisma, getClientSessions };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/sessions/project-sources", () => ({ getClientSessions: h.getClientSessions }));

import { insumosDelAnalisisParaLaGuia, loQueSeSupoEnSesionesAnteriores, preguntasDelDemoParaLaPreparacion } from "./para-la-guia-server";

const decision = (seSabe: Partial<Record<string, string>>) =>
  ["quien_decide", "para_cuando", "cuanto_invertir", "si_no_hacen_nada"].map((hueco) => ({
    hueco,
    seSabe: !!seSabe[hueco],
    texto: seSabe[hueco] ?? `¿${hueco}?`,
    cita: null,
    deAntes: false,
  }));
const resultado = (o: { decision?: unknown; numeros?: unknown; demo?: unknown }) => ({ resumen: "x", juicios: [], recomendaciones: [], bien: [], enfoque: null, numeros: [], demo: [], ...o });

const NOV6 = Date.parse("2026-11-06T20:00:00Z");
const NOV5 = Date.parse("2026-11-05T20:00:00Z");

beforeEach(() => {
  h.estado.reuniones = [
    { id: "s2", title: "Diagnóstico", date: NOV6 },
    { id: "s1", title: "Primera", date: NOV5 },
  ];
  h.estado.filas = [];
  h.estado.pedidos = [];
});

describe("los insumos del análisis para la guía", () => {
  it("salen del análisis más nuevo de ESTA empresa; uno de otra empresa con el mismo id no entra", async () => {
    h.estado.filas = [
      { sessionId: "s2", clientId: "OTRA", estado: "PROPUESTO", resultado: resultado({ decision: decision({}), demo: [{ pregunta: "De otro cliente", quien: "X" }] }) },
      { sessionId: "s1", clientId: "centauro", estado: "PROPUESTO", resultado: resultado({ decision: decision({ quien_decide: "Fernando" }), numeros: [{ falta: "¿Meta de cierres?" }] }) },
    ];
    const lineas = await insumosDelAnalisisParaLaGuia("centauro");
    expect(h.estado.pedidos.map((p) => p.clientId)).toEqual(["centauro"]);
    expect(lineas.join("\n")).not.toMatch(/otro cliente/);
    expect(lineas[0]).toMatch(/«Primera»/);
    expect(lineas).toContain("- Número que falta: ¿Meta de cierres?");
  });
  it("un hueco que el resumen de la preventa ya responde hoy no viaja", async () => {
    h.estado.filas = [{ sessionId: "s2", clientId: "centauro", estado: "PROPUESTO", resultado: resultado({ decision: decision({}) }) }];
    const sin = await insumosDelAnalisisParaLaGuia("centauro");
    const con = await insumosDelAnalisisParaLaGuia("centauro", { presupuesto: "Entre 15 y 20 mil dólares", autoridad: [{ nombre: "Laura", rol: "influye" }] });
    expect(sin.filter((l) => l.includes("cuánto pueden invertir"))).toHaveLength(1);
    expect(con.filter((l) => l.includes("cuánto pueden invertir"))).toHaveLength(0);
    // Con solo alguien que influye, «quién decide» sigue abierto.
    expect(con.filter((l) => l.includes("quién decide"))).toHaveLength(1);
  });
  it("un análisis de antes del 8 nov (sin los campos nuevos) no aporta nada", async () => {
    h.estado.filas = [{ sessionId: "s2", clientId: "centauro", estado: "PROPUESTO", resultado: { resumen: "x", juicios: [], recomendaciones: [] } }];
    expect(await insumosDelAnalisisParaLaGuia("centauro")).toEqual([]);
  });
});

describe("las preguntas para el demo, para la Preparación (sexta vuelta)", () => {
  it("salen del mismo análisis que alimenta la guía, con quién preguntó y de qué reunión; uno de otra empresa no entra", async () => {
    h.estado.filas = [
      { sessionId: "s2", clientId: "OTRA", estado: "PROPUESTO", resultado: resultado({ decision: decision({}), demo: [{ pregunta: "De otro cliente", quien: "X" }] }) },
      {
        sessionId: "s1",
        clientId: "centauro",
        estado: "PROPUESTO",
        resultado: resultado({ decision: decision({}), demo: [{ pregunta: "¿Se puede ver el embudo por vendedor?", quien: "Laura" }] }),
      },
    ];
    const demo = await preguntasDelDemoParaLaPreparacion("centauro");
    expect(h.estado.pedidos.map((p) => p.clientId)).toEqual(["centauro"]);
    expect(demo?.preguntas).toEqual([{ pregunta: "¿Se puede ver el embudo por vendedor?", quien: "Laura" }]);
    expect(demo?.deLaReunion).toMatch(/«Primera»/);
    // La guía recibe las mismas, marcadas para no preguntarlas.
    expect((await insumosDelAnalisisParaLaGuia("centauro")).join("\n")).toMatch(/Para el demo \(lo preguntó Laura\).*No se responde en la exploración/);
  });
  it("sin preguntas para el demo, o con un análisis de antes del 8 nov, no hay nada que mostrar", async () => {
    h.estado.filas = [{ sessionId: "s2", clientId: "centauro", estado: "PROPUESTO", resultado: resultado({ decision: decision({}) }) }];
    expect(await preguntasDelDemoParaLaPreparacion("centauro")).toBeNull();
    h.estado.filas = [{ sessionId: "s2", clientId: "centauro", estado: "PROPUESTO", resultado: { resumen: "x", juicios: [], recomendaciones: [] } }];
    expect(await preguntasDelDemoParaLaPreparacion("centauro")).toBeNull();
  });
});

describe("lo que se supo en sesiones anteriores", () => {
  it("solo de reuniones ANTERIORES de esta empresa, con el chokepoint acotado a antes de la reunión", async () => {
    h.estado.reuniones = [{ id: "s3", title: "Después", date: Date.parse("2026-11-10T20:00:00Z") }, ...h.estado.reuniones];
    h.estado.filas = [
      { sessionId: "s3", clientId: "centauro", estado: "PROPUESTO", resultado: resultado({ decision: decision({ cuanto_invertir: "Lo dijeron después" }) }) },
      { sessionId: "s1", clientId: "centauro", estado: "PROPUESTO", resultado: resultado({ decision: decision({ quien_decide: "Fernando" }) }) },
      { sessionId: "s1", clientId: "OTRA", estado: "PROPUESTO", resultado: resultado({ decision: decision({ para_cuando: "De otro cliente" }) }) },
    ];
    const fecha = new Date(NOV6);
    const sabido = await loQueSeSupoEnSesionesAnteriores("centauro", fecha, "s2");
    expect(sabido).toEqual({ quien_decide: "Fernando" });
    expect(h.estado.pedidos).toEqual([{ clientId: "centauro", opts: { before: fecha, take: 30 } }]);
  });
});
