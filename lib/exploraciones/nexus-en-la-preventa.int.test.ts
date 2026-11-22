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
/** La llamada que responde una pregunta falla (la IA no contesta). */
let fallaLaRespuesta = false;
const pedidos: string[] = [];
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (p: { system: string; messages: { content: unknown }[] }) => {
        const todo = JSON.stringify(p.messages);
        pedidos.push(todo);
        const esRespuesta = p.system.includes("te pregunta algo sobre UNA cuenta");
        if (esRespuesta && fallaLaRespuesta) throw new Error("la IA no respondió");
        if (esRespuesta) {
          // La respuesta sale por la herramienta obligatoria «responder», como en producción.
          const input = { sabe: true, respuesta: "La cobranza la hacen a mano, con un Excel.", citas: [{ fuente: "R1", cita: "la cobranza la hacemos a mano con un Excel" }] };
          return { content: [{ type: "tool_use", id: "t1", name: "responder", input }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } };
        }
        return { content: [{ type: "text", text: JSON.stringify(siguiente) }], usage: { input_tokens: 1, output_tokens: 1 } };
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
import { alGuardarLaNota, cerrarEnLaPreventa, conversacionEnLaPreventa, estadosEnLaPreventa, vueltaEnLaPreventa } from "./nexus-en-la-preventa-server";
import { hechosDeLasNotas } from "./hechos-de-las-notas-server";
import { RESPUESTA_SIN_ACCESO } from "@/lib/chat-de-nexus/guardada";

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
  fallaLaRespuesta = false;
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

describe("la conversación guardada no cruza de persona ni de preventa", () => {
  const PREGUNTA = { tipo: "pregunta", preguntas: ["¿De qué mes es esa cifra?"] };

  it("vuelve con sus mensajes para quien la tuvo, en su preventa, y para nadie más", async () => {
    const { id } = await sembrar();
    const otra = await sembrar2();
    siguiente = PREGUNTA;
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(v.ok).toBe(true);
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c).toMatchObject({ id: CONVERSACION, mensajes: [{ de: "persona", texto: NOTA }, { de: "nexus", texto: "¿De qué mes es esa cifra?" }], listo: null });
    // Otra persona en la misma preventa, y la misma persona en otra preventa: nada.
    expect(await conversacionEnLaPreventa(id, "marco@smarteam.test", CON_ACCESO)).toBeNull();
    expect(await conversacionEnLaPreventa(otra, EMAIL, CON_ACCESO)).toBeNull();
    // Leerla no gasta los topes.
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL } })).toBe(1);
  });

  it("otra preventa del MISMO cliente no la ve, ni puede anotar en ella ni cerrarla", async () => {
    // Una sola preventa viva por empresa (índice único): la otra del mismo cliente es la que vino después de archivar.
    const { id, clientId } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v.ok || v.turno.tipo !== "listo") throw new Error("esperaba listo");
    await prisma.exploracionDeVenta.update({ where: { id }, data: { archivadaEn: new Date() } });
    const hermana = (await prisma.exploracionDeVenta.create({ data: { clientId, creadaPor: EMAIL }, select: { id: true } })).id;
    expect(await conversacionEnLaPreventa(hermana, EMAIL, CON_ACCESO)).toBeNull();
    expect((await estadosEnLaPreventa(hermana, CONVERSACION, EMAIL, { [v.turno.cambios[0].id]: "descartado" })).ok).toBe(false);
    await cerrarEnLaPreventa(hermana, CONVERSACION, EMAIL);
    // De vuelta en la suya, sigue abierta y sin lo que se intentó desde la otra.
    await prisma.exploracionDeVenta.update({ where: { id: hermana }, data: { archivadaEn: new Date() } });
    await prisma.exploracionDeVenta.update({ where: { id }, data: { archivadaEn: null } });
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.listo?.estados).toEqual({});
    expect(c?.id).toBe(CONVERSACION);
  });

  it("sin acceso HOY a la cuenta, la respuesta que leyó sus reuniones vuelve como aviso, sin sus citas", async () => {
    const { id, clientId } = await sembrar();
    await prisma.firefliesSession.create({
      data: { id: "ses-guardada", title: "Diagnóstico", date: new Date("2026-11-10T15:00:00Z"), participants: ["ana@centauro.test"], resolvedClientId: clientId, transcript: "Ana Mora: La cobranza la hacemos a mano con un Excel." },
    });
    siguiente = { tipo: "consulta", pregunta: "¿Cómo cobran?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¿Cómo cobran?" }], EMAIL, CON_ACCESO);
    expect(v.ok && v.turno.tipo).toBe("respuesta");
    const con = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(JSON.stringify(con)).toContain("la hacemos a mano");
    const sin = await conversacionEnLaPreventa(id, EMAIL, async () => false);
    expect(sin?.mensajes.map((m) => m.texto)).toEqual(["¿Cómo cobran?", RESPUESTA_SIN_ACCESO]);
    expect(JSON.stringify(sin)).not.toContain("a mano");
  });

  it("el «listo» vuelve con su nota, lo aplicado y lo descartado; «Nueva conversación» la cierra", async () => {
    const { id } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v.ok || v.turno.tipo !== "listo") throw new Error("esperaba listo");
    const idDelCambio = v.turno.cambios[0].id;
    await guardarLaNota(id);
    await alGuardarLaNota(id, CONVERSACION, CLAVE, EMAIL);
    // Otra persona no puede anotar en la conversación de Liz.
    expect((await estadosEnLaPreventa(id, CONVERSACION, "marco@smarteam.test", { [idDelCambio]: "descartado" })).ok).toBe(false);
    expect((await estadosEnLaPreventa(id, CONVERSACION, EMAIL, { [idDelCambio]: "aplicado", "inventado:1": "aplicado" })).ok).toBe(true);
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.listo).toMatchObject({ notaClave: CLAVE, estados: { [idDelCambio]: "aplicado" }, guardado: { hechos: { estado: "escritos" } } });
    expect(c?.listo?.cambios.map((x) => x.id)).toEqual([idDelCambio]);
    // Lo que mandó Marco no quedó.
    expect(c?.listo?.estados).toEqual({ [idDelCambio]: "aplicado" });

    await cerrarEnLaPreventa(id, CONVERSACION, EMAIL);
    expect(await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO)).toBeNull();
    // Los hechos siguen saliendo del «listo» del servidor: anotar no rompió la vuelta.
    expect(await prisma.hechoDeReunion.count({ where: { exploracionId: id } })).toBe(1);
  });
});

describe("los hechos de las notas, debajo de cada nota", () => {
  const fila = (clientId: string, exploracionId: string, frase: string) => ({
    clientId,
    exploracionId,
    notaClave: CLAVE,
    dichoPorEmail: EMAIL,
    tipo: "cuenta",
    frase,
    cita: "pierden unos 40 mil dólares",
    citaFuente: "texto",
    huella: `cuenta|${frase}`,
    fechaDeLaReunion: new Date("2026-11-21T15:00:00Z"),
  });

  it("solo los de esta preventa y su cliente, con quién lo dijo", async () => {
    const { id, clientId } = await sembrar();
    await guardarLaNota(id);
    const otra = await sembrar2();
    const otroCliente = await prisma.client.create({ data: { name: "Otra empresa", kind: "PROSPECTO" }, select: { id: true } });
    await prisma.hechoDeReunion.createMany({
      data: [fila(clientId, id, "La empresa pierde plata"), fila(clientId, otra, "De otra preventa"), fila(otroCliente.id, id, "Con otro cliente")],
    });
    const hechos = await hechosDeLasNotas(id);
    expect(Object.keys(hechos)).toEqual([CLAVE]);
    expect(hechos[CLAVE].map((h) => [h.frase, h.dichoPor])).toEqual([["La empresa pierde plata", "Liz Flores"]]);
  });

  it("una nota quitada no muestra sus hechos", async () => {
    const { id, clientId } = await sembrar();
    await prisma.hechoDeReunion.create({ data: fila(clientId, id, "La empresa pierde plata") });
    expect(await hechosDeLasNotas(id)).toEqual({});
  });
});

/** Otra preventa, de otra empresa, para la misma persona. */
async function sembrar2(): Promise<string> {
  const c = await prisma.client.create({ data: { name: "Otra preventa", kind: "PROSPECTO" }, select: { id: true } });
  const e = await prisma.exploracionDeVenta.create({ data: { clientId: c.id, creadaPor: EMAIL }, select: { id: true } });
  return e.id;
}

describe("lo seguro lo decide el código, lo dudoso el modelo, y nada se guarda solo (Cemaco, 21 nov)", () => {
  const ELIAS = "Es importante esto de que crédito cobro contacta a los clientes sin aprovechar para venderle más y que cada gestor tiene muchas cuentas";

  it("la frase de Elías queda como «listo» aunque el modelo diga consulta; no se lee ninguna reunión ni va su nombre", async () => {
    const { id } = await sembrar();
    // Lo que devolvió el modelo en producción: una pregunta inventada sobre quien escribe.
    siguiente = { tipo: "consulta", pregunta: "¿Qué dijo Elías sobre crédito y cobro que no estuviera ya en lo que se sabe?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: ELIAS }], EMAIL, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    expect(v.turno).toMatchObject({ tipo: "listo", cambios: [] });
    // Una sola llamada (la vuelta): ninguna respuesta leyó la cuenta.
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain("NO ES UNA PREGUNTA");
    expect(pedidos[0]).not.toContain("Liz Flores");
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL, filters: { path: ["modo"], equals: "chat-de-nexus-respuesta" } } })).toBe(0);
    // Hasta el «Guardar», la conversación vuelve con lo que iba a guardarse y sin nota.
    expect((await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO))?.listo).toMatchObject({ notaClave: null, hechos: [] });
    // Con «Guardar», la pantalla guarda la nota con sus palabras, y la revisión la anota en la conversación.
    await prisma.exploracionDeVenta.update({
      where: { id },
      data: { contenido: { notas: { [CLAVE]: ELIAS }, autoresDeLasNotas: { [CLAVE]: { por: EMAIL, en: "2026-11-21T15:00:00.000Z" } } } },
    });
    expect((await alGuardarLaNota(id, CONVERSACION, CLAVE, EMAIL)).ok).toBe(true);
    expect((await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO))?.listo).toMatchObject({ notaClave: CLAVE });
  });

  it("una pregunta de verdad se responde con las palabras de la persona, no con las del modelo", async () => {
    const { id } = await sembrar();
    siguiente = { tipo: "consulta", pregunta: "¿Qué dijo Liz de la cobranza?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¿Cómo cobran hoy?" }], EMAIL, CON_ACCESO);
    if (!v.ok || v.turno.tipo !== "respuesta") throw new Error("esperaba una respuesta");
    expect(pedidos[pedidos.length - 1]).toContain("¿Cómo cobran hoy?");
    expect(pedidos[pedidos.length - 1]).not.toContain("¿Qué dijo Liz");
  });

  it("«Guardarlo como nota»: con `contar`, lo que tenía forma de pregunta se cuenta, y la respuesta no vuelve", async () => {
    const { id } = await sembrar();
    const TEXTO = "¿Sabías que cobran a mano con un Excel?";
    siguiente = { tipo: "consulta" };
    // Primero Nexus lo tomó como pregunta y respondió.
    const antes = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: TEXTO }], EMAIL, CON_ACCESO);
    if (!antes.ok || antes.turno.tipo !== "respuesta") throw new Error("esperaba una respuesta");
    pedidos.length = 0;
    // La pantalla saca el par pregunta-respuesta y manda lo escrito con `contar` (paraContarComoNota).
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: TEXTO }], EMAIL, CON_ACCESO, { contar: true });
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("listo");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain("NO ES UNA PREGUNTA");
    // Al volver, la conversación es la del «listo»: sin la respuesta que salió con el botón.
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.mensajes).toEqual([{ de: "persona", texto: TEXTO }]);
    expect(c?.listo).not.toBeNull();
  });

  const RESPONDIO = [
    { de: "persona" as const, texto: "¿Cuales son los principales dolores de este cliente?", es: "consulta" as const },
    { de: "nexus" as const, texto: "1. **Sin vista 360 del cliente**. 2. **Campañas sin segmentar**.", es: "respuesta" as const },
  ];

  it("«resumelos» después de una respuesta se responde, sin pasar por el modelo que clasifica y sobre lo ya respondido", async () => {
    const { id } = await sembrar();
    // Si llegara al modelo que clasifica, este «listo» lo guardaría como nota: no debe llegar.
    siguiente = LISTO;
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [...RESPONDIO, { de: "persona", texto: "resumelos" }], EMAIL, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("respuesta");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain("=== LA PREGUNTA ===\\nresumelos");
    expect(pedidos[0]).toContain("Sin vista 360 del cliente");
    // La conversación guardada la muestra como pregunta respondida, no como algo para guardar.
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.listo).toBeNull();
    expect(c?.mensajes.at(-2)).toMatchObject({ de: "persona", texto: "resumelos", es: "consulta" });
  });

  it("lo dudoso lo decide el modelo: si dice consulta, se responde con las palabras de la persona", async () => {
    const { id } = await sembrar();
    siguiente = { tipo: "consulta", pregunta: "¿Cuál es el segundo dolor de Cemaco?" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [...RESPONDIO, { de: "persona", texto: "y el segundo" }], EMAIL, CON_ACCESO);
    if (!v.ok || v.turno.tipo !== "respuesta") throw new Error("esperaba una respuesta");
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]).toContain("PUEDE SER ALGO QUE CUENTA O UN PEDIDO");
    expect(pedidos[1]).toContain("=== LA PREGUNTA ===\\ny el segundo");
    expect(pedidos[1]).not.toContain("¿Cuál es el segundo dolor");
  });

  it("«¿Era una pregunta? Respóndela»: con `preguntar`, se responde sin clasificar, y lo que iba a guardarse no vuelve", async () => {
    const { id } = await sembrar();
    const v1 = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v1.ok || v1.turno.tipo !== "listo") throw new Error("esperaba listo");
    expect((await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO))?.listo).toMatchObject({ notaClave: null, hechos: ["La empresa pierde plata por su cartera vencida"] });
    pedidos.length = 0;
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO, { preguntar: true });
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("respuesta");
    expect(pedidos).toHaveLength(1);
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.listo).toBeNull();
    expect(c?.mensajes.map((m) => m.de)).toEqual(["persona", "nexus"]);
  });

  it("«¿Era una pregunta?» con el tope de preguntas del día cumplido no deja corrida: lo que iba a guardarse vuelve igual", async () => {
    const { id, clientId } = await sembrar();
    const v1 = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v1.ok || v1.turno.tipo !== "listo") throw new Error("esperaba listo");
    await prisma.agentRun.createMany({
      data: Array.from({ length: PREGUNTAS_POR_DIA }, () => ({ agentSlug: "x", clientId, status: "DONE" as const, triggeredByEmail: EMAIL, filters: { modo: "chat-de-nexus-respuesta", conversacion: "otra" } })),
    });
    pedidos.length = 0;
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO, { preguntar: true });
    expect(v).toMatchObject({ ok: false, status: 429 });
    expect(pedidos).toHaveLength(0);
    expect((await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO))?.listo).toMatchObject({ notaClave: null });
  });

  it("«¿Era una pregunta?» cuando la IA no responde: error, y lo que iba a guardarse vuelve igual al recargar", async () => {
    const { id } = await sembrar();
    const v1 = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    if (!v1.ok || v1.turno.tipo !== "listo") throw new Error("esperaba listo");
    fallaLaRespuesta = true;
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO, { preguntar: true });
    expect(v).toMatchObject({ ok: false, status: 502 });
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.listo).toMatchObject({ notaClave: null, cambios: [{ destino: "negocio" }] });
  });

  it("después de «Guardarlo como nota», al volver, lo que iba a guardarse dice que se eligió contar", async () => {
    const { id } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO, { contar: true });
    if (!v.ok || v.turno.tipo !== "listo") throw new Error("esperaba listo");
    expect((await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO))?.listo).toMatchObject({ contado: true });
  });
});
