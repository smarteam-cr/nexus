/**
 * lib/exploraciones/nexus-en-la-preventa.int.test.ts — «Hablar con Nexus» en la preventa contra una base REAL (21 nov):
 * una vuelta queda medida, los topes se cuentan en la base y frenan, la nota guardada deja sus hechos con su preventa,
 * su corrida y quién la dijo (sin duplicarlos), una pregunta se responde leyendo SOLO las reuniones de esta cuenta (por
 * el chokepoint) con su cita, la base rechaza un hecho de nota sin su preventa o sin autor, e INV45 caza uno de otro
 * cliente.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/exploraciones/nexus-en-la-preventa.int.test.ts --project integration
 * Claude es de mentira: la vuelta responde lo que diga `siguiente` y la respuesta cita la reunión de esta cuenta.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const NOTA = "El gerente nos confirmó que pierden unos 40 mil dólares al mes en cartera vencida.";
const LISTO = {
  tipo: "listo",
  cambios: [{ destino: "negocio", valor: { cartera: "US$ 40.000 al mes vencidos" }, porque: "Es lo que pierden en cartera.", cita: "pierden unos 40 mil dólares al mes en cartera vencida" }],
  hechos: [{ tipo: "cuenta", frase: "La empresa pierde plata por su cartera vencida", cita: "pierden unos 40 mil dólares al mes en cartera vencida" }],
};
let siguiente: unknown = LISTO;
const pedidos: string[] = [];
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (p: { system: string; messages: { content: unknown }[] }) => {
        const todo = JSON.stringify(p.messages);
        pedidos.push(todo);
        const esRespuesta = p.system.includes("te pregunta algo sobre UNA cuenta");
        const salida = esRespuesta
          ? { sabe: true, respuesta: "La cobranza la hacen a mano, con un Excel.", citas: [{ fuente: "R1", cita: "la cobranza la hacemos a mano con un Excel" }] }
          : siguiente;
        return { content: [{ type: "text", text: JSON.stringify(salida) }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { hechosFueraDeSuCliente } from "@/lib/invariantes/hechos";
import { olvidarHechosMirado } from "@/lib/seguimiento/hechos-server";
import { MODO_DEL_CHAT } from "@/lib/chat-de-nexus/conversacion-server";
import { TOPES } from "@/lib/chat-de-nexus/conversacion";
import { PREGUNTAS_POR_DIA } from "@/lib/chat-de-nexus/respuesta";
import { alGuardarLaNota, vueltaEnLaPreventa } from "./nexus-en-la-preventa-server";

const EMAIL = "liz@smarteam.test";
const CON_ACCESO = async () => true;
const CLAVE = "sabido:mi0abcde123";
const CONVERSACION = "conv-de-prueba-1";
let antes: string | undefined;

beforeAll(() => {
  antes = process.env.SEGUIMIENTO_HECHOS;
  process.env.SEGUIMIENTO_HECHOS = "1";
  olvidarHechosMirado();
});
afterAll(() => {
  if (antes === undefined) delete process.env.SEGUIMIENTO_HECHOS;
  else process.env.SEGUIMIENTO_HECHOS = antes;
});
beforeEach(() => {
  siguiente = LISTO;
  pedidos.length = 0;
});

async function sembrar() {
  const c = await prisma.client.create({ data: { name: "Centauro de prueba", kind: "PROSPECTO" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({ data: { clientId: c.id, creadaPor: EMAIL }, select: { id: true } });
  await prisma.teamMember.create({ data: { name: "Liz Flores", email: EMAIL } });
  return { clientId: c.id, id: e.id };
}

/** La nota como la deja la operación `nota` de la pantalla: el texto y quién la guardó. */
async function guardarLaNota(id: string) {
  await prisma.exploracionDeVenta.update({
    where: { id },
    data: { contenido: { notas: { [CLAVE]: NOTA }, autoresDeLasNotas: { [CLAVE]: { por: EMAIL, en: "2026-11-21T15:00:00.000Z" } } } },
  });
}

describe("una conversación en la preventa", () => {
  it("la vuelta queda medida y propone el cambio", async () => {
    const { id } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("listo");
    if (v.turno.tipo !== "listo") return;
    expect(v.turno.cambios.map((c) => [c.destino, c.valor])).toEqual([["negocio", { cartera: "US$ 40.000 al mes vencidos" }]]);
    const corridas = await prisma.agentRun.findMany({ where: { triggeredByEmail: EMAIL }, select: { status: true, filters: true } });
    expect(corridas).toHaveLength(1);
    expect(corridas[0]).toMatchObject({ status: "DONE", filters: { modo: "chat-de-nexus", conversacion: CONVERSACION, exploracion: id } });
  });

  it("los topes se cuentan en la base: por conversación y por día", async () => {
    const { id, clientId } = await sembrar();
    const corrida = (conversacion: string) => ({ agentSlug: "x", clientId, status: "DONE" as const, triggeredByEmail: EMAIL, filters: { modo: MODO_DEL_CHAT, conversacion } });
    await prisma.agentRun.createMany({ data: Array.from({ length: TOPES.turnosPorConversacion }, () => corrida(CONVERSACION)) });
    const llena = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(llena).toMatchObject({ ok: false, status: 429 });
    // Otra conversación sigue… hasta el tope del día.
    expect((await vueltaEnLaPreventa(id, "conv-de-prueba-2", [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO)).ok).toBe(true);
    await prisma.agentRun.createMany({ data: Array.from({ length: TOPES.turnosPorDia }, (_, i) => corrida(`otra-${i}`)) });
    expect(await vueltaEnLaPreventa(id, "conv-de-prueba-3", [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO)).toMatchObject({ ok: false, status: 429 });
  });

  it("al guardar, la nota deja sus hechos con su preventa, su corrida y quién la dijo, una sola vez", async () => {
    const { id, clientId } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(v.ok).toBe(true);
    await guardarLaNota(id);
    const g = await alGuardarLaNota(id, CONVERSACION, CLAVE, EMAIL);
    if (!g.ok) throw new Error(g.error);
    expect(g.hechos).toEqual({ estado: "escritos", escritos: 1, descartados: 0 });
    // Sin Resumen armado, el agente de impacto no llama a la IA ni avisa.
    expect(g.impacto.cambia).toBe(false);
    const hechos = await prisma.hechoDeReunion.findMany({ where: { exploracionId: id } });
    expect(hechos).toHaveLength(1);
    const corrida = await prisma.agentRun.findFirst({ where: { triggeredByEmail: EMAIL }, select: { id: true } });
    expect(hechos[0]).toMatchObject({ clientId, notaClave: CLAVE, dichoPorEmail: EMAIL, quien: "smarteam", citaFuente: "texto", sessionId: null, estado: "pendiente", agentRunId: corrida!.id });
    expect(hechos[0].destinos).toEqual([{ clave: "preventa", estado: "delegado", ref: { tipo: "preventa", exploracionIds: [id] } }]);

    const otraVez = await alGuardarLaNota(id, CONVERSACION, CLAVE, EMAIL);
    expect(otraVez.ok && otraVez.hechos).toEqual({ estado: "ya-estaban", escritos: 1 });
    expect(await prisma.hechoDeReunion.count({ where: { exploracionId: id } })).toBe(1);
    expect((await hechosFueraDeSuCliente(prisma)).fuera).toEqual([]);
  });

  it("una nota de otra persona no deja hechos a nombre de quien llama", async () => {
    const { id } = await sembrar();
    await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], "marco@smarteam.test", CON_ACCESO);
    await guardarLaNota(id);
    const g = await alGuardarLaNota(id, CONVERSACION, CLAVE, "marco@smarteam.test");
    expect(g.ok && g.hechos).toEqual({ estado: "sin-conversacion" });
  });
});

describe("Nexus responde preguntas sobre la cuenta", () => {
  it("lee solo las reuniones de ESTA cuenta, por el chokepoint, y cita la que lo respalda", async () => {
    const { id, clientId } = await sembrar();
    const otra = await prisma.client.create({ data: { name: "Otra empresa", kind: "PROSPECTO" }, select: { id: true } });
    await prisma.firefliesSession.create({
      data: {
        id: "ses-de-centauro",
        title: "Diagnóstico de Cobranza",
        date: new Date("2026-11-10T15:00:00Z"),
        participants: ["ana@centauro.test", EMAIL],
        resolvedClientId: clientId,
        transcript: "Ana Mora: La cobranza la hacemos a mano con un Excel que nadie actualiza.\nLiz Flores: En HubSpot eso se puede automatizar.",
      },
    });
    await prisma.firefliesSession.create({
      data: { id: "ses-de-otra", title: "Secreto de otra empresa", date: new Date("2026-11-11T15:00:00Z"), participants: ["beto@otra.test"], resolvedClientId: otra.id, transcript: "Beto Ruiz: El margen secreto es 42 por ciento." },
    });
    siguiente = { tipo: "consulta", pregunta: "¿Cómo cobran hoy?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¿Cómo cobran hoy?" }], EMAIL, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    if (v.turno.tipo !== "respuesta") throw new Error(`esperaba una respuesta, vino ${v.turno.tipo}`);
    expect(v.turno.respuesta.citas).toEqual([
      { fuente: "R1", deDonde: "Reunión del 2026-11-10: Diagnóstico de Cobranza", texto: "La cobranza la hacemos a mano con un Excel", deQuien: "cliente", hablante: "Ana Mora" },
    ]);
    // Lo que leyó la respuesta: la reunión de Centauro, con de qué lado es cada turno; nunca la de otra empresa.
    const leido = pedidos[pedidos.length - 1];
    expect(leido).toContain("Ana Mora (cliente)");
    expect(leido).toContain("Liz Flores (Smarteam)");
    expect(leido).not.toContain("margen secreto");
    const modos = (await prisma.agentRun.findMany({ where: { triggeredByEmail: EMAIL }, select: { filters: true } })).map((r) => (r.filters as { modo: string }).modo);
    expect(modos.sort()).toEqual(["chat-de-nexus", "chat-de-nexus-respuesta"]);
  });

  it("sin acceso a la cuenta, responde sin leer sus reuniones y lo dice", async () => {
    const { id, clientId } = await sembrar();
    await prisma.firefliesSession.create({
      data: { id: "ses-cliente", title: "Diagnóstico", date: new Date("2026-11-10T15:00:00Z"), participants: ["ana@centauro.test"], resolvedClientId: clientId, transcript: "Ana Mora: El presupuesto aprobado es de 90 mil." },
    });
    siguiente = { tipo: "consulta", pregunta: "¿Cuánto presupuesto tienen?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¿Cuánto presupuesto tienen?" }], EMAIL, async () => false);
    if (!v.ok || v.turno.tipo !== "respuesta") throw new Error("esperaba una respuesta");
    expect(v.turno.respuesta.afuera.sinAcceso).toBe(true);
    expect(pedidos[pedidos.length - 1]).not.toContain("presupuesto aprobado");
  });

  it("el tope de preguntas del día frena, contado en la base", async () => {
    const { id, clientId } = await sembrar();
    await prisma.agentRun.createMany({
      data: Array.from({ length: PREGUNTAS_POR_DIA }, () => ({ agentSlug: "x", clientId, status: "DONE" as const, triggeredByEmail: EMAIL, filters: { modo: "chat-de-nexus-respuesta", conversacion: "otra" } })),
    });
    siguiente = { tipo: "consulta", pregunta: "¿Quién decide?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¿Quién decide?" }], EMAIL, CON_ACCESO);
    expect(v).toMatchObject({ ok: false, status: 429 });
  });
});

describe("la base y la invariante", () => {
  const fila = (clientId: string, o: Record<string, unknown>) => ({
    clientId,
    tipo: "cuenta",
    frase: "La empresa pierde plata",
    cita: "pierden unos 40 mil dólares",
    citaFuente: "texto",
    huella: "cuenta|empresa pierde plata",
    fechaDeLaReunion: new Date(),
    ...o,
  });

  it("un hecho de nota va con su preventa y su autor (CHECK)", async () => {
    const { id, clientId } = await sembrar();
    await expect(prisma.hechoDeReunion.create({ data: fila(clientId, { notaClave: CLAVE, exploracionId: id }) as never })).rejects.toThrow();
    await expect(prisma.hechoDeReunion.create({ data: fila(clientId, { notaClave: CLAVE, dichoPorEmail: EMAIL }) as never })).rejects.toThrow();
    await expect(prisma.hechoDeReunion.create({ data: fila(clientId, {}) as never })).rejects.toThrow();
  });

  it("INV45 caza un hecho de nota que no es del cliente de su preventa", async () => {
    const { id } = await sembrar();
    const otra = await prisma.client.create({ data: { name: "Otra empresa", kind: "PROSPECTO" }, select: { id: true } });
    await prisma.hechoDeReunion.create({ data: fila(otra.id, { notaClave: CLAVE, exploracionId: id, dichoPorEmail: EMAIL }) as never });
    const { fuera } = await hechosFueraDeSuCliente(prisma);
    expect(fuera.map((f) => f.motivo)).toEqual(["otro_cliente"]);
  });
});
