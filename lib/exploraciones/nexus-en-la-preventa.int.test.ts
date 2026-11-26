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
/** La mano de la cuenta (24 nov, una sola conversación): la tarea (o las tareas) que propone, o nada (solo contesta). */
let tareaQuePropone: string | string[] | null = "Llamar a Ana";
/** Con esto, la mano de la cuenta pide una nota de la cuenta (que en la preventa no se ofrece) en vez de una tarea. */
let pideUnaNota = false;
/** El contexto de cada llamada medida (a quién se carga el gasto). */
const contextos: Array<{ agentSlug?: string; origen?: string; triggeredByEmail?: string; agentRunId?: string | null }> = [];
/** Lo que la mano de la cuenta recibió en cada llamada: sus mensajes y sus herramientas. */
const pedidosALaCuenta: Array<{ mensajes: string; herramientas: string[] }> = [];
/** La llamada que responde una pregunta falla (la IA no contesta). */
let fallaLaRespuesta = false;
const pedidos: string[] = [];
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (p: { system: unknown; messages: { content: unknown }[]; tools?: { name: string }[] }) => {
        const todo = JSON.stringify(p.messages);
        // La mano de la cuenta: llega con sus herramientas (el chat de la cuenta), y propone una tarea en una sola vuelta.
        if (Array.isArray(p.tools) && p.tools.some((t) => t.name === "tarea_crear")) {
          pedidosALaCuenta.push({ mensajes: todo, herramientas: p.tools.map((t) => t.name) });
          const titulos = tareaQuePropone === null ? [] : Array.isArray(tareaQuePropone) ? tareaQuePropone : [tareaQuePropone];
          const usos = pideUnaNota
            ? [{ type: "tool_use", id: `n${pedidosALaCuenta.length}`, name: "nota_crear", input: { texto: "Llamaron por WhatsApp" } }]
            : titulos.map((titulo, k) => ({ type: "tool_use", id: `u${pedidosALaCuenta.length}-${k}`, name: "tarea_crear", input: { titulo } }));
          return { content: [{ type: "text", text: usos.length ? "Te dejo la tarea en la lista." : "No veo nada que cambiar." }, ...usos], stop_reason: usos.length ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
        }
        pedidos.push(todo);
        const esRespuesta = typeof p.system === "string" && p.system.includes("te pregunta algo sobre UNA cuenta");
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

/** La guía que la mano de la cuenta recibe cuando el pedido viene desde la guía (su base real pide sesiones armadas). */
const GUIA_DE_PRUEBA = "PREGUNTAS DE LA GUÍA DE PRUEBA";
vi.mock("@/lib/operaciones/guia-server", async (original) => {
  const real = await original<typeof import("@/lib/operaciones/guia-server")>();
  return {
    ...real,
    baseDeLaGuia: async () => ({}) as Awaited<ReturnType<typeof real.baseDeLaGuia>>,
    loEstableDeLaGuia: () => "LA GUÍA ESTABLE DE PRUEBA",
    preguntasDeLaGuiaParaElChat: () => GUIA_DE_PRUEBA,
  };
});

vi.mock("@/lib/ai/contexto-de-corrida", async (original) => {
  const real = await original<typeof import("@/lib/ai/contexto-de-corrida")>();
  return {
    ...real,
    conContextoDeIA: <T,>(ctx: (typeof contextos)[number], fn: () => T): T => {
      contextos.push(ctx);
      return real.conContextoDeIA(ctx as Parameters<typeof real.conContextoDeIA>[0], fn);
    },
  };
});

/**
 * La mano de La escala (25 nov, un solo contexto): el contrato de la página es de mentira acá (su base real pide la escala
 * publicada y el Resumen armado; lo prueba escala-con-nexus.int.test.ts). Se anota con qué se llamó.
 */
const PROPUESTA_DE_LA_ESCALA = {
  pedido: "x",
  cambios: [
    { clave: "r/negocio:tesis:n1", nombre: "El problema principal (la tesis)", seccion: "El problema principal", antes: "Meta no jala datos.", despues: "Fundatec no sincroniza.", aMano: false, agregar: false },
    { clave: "r/punto:nuevo", nombre: "Un punto clave nuevo, entero", seccion: "Puntos clave", antes: null, despues: "Título: X\nQué pasa: Y", aMano: false, agregar: true },
  ],
  descartados: [],
  nota: "Lo acoplé a Fundatec.",
  corrida: null,
};
const pedidosALaEscala: Array<{ pedido: string; foco: string | null; antes?: { hablado: string; dichoPorLaPersona: string } }> = [];
let topeDeLaEscala: { ok: true } | { ok: false; status: number; error: string } = { ok: true };
vi.mock("./escala-con-nexus-server", async (original) => {
  const real = await original<typeof import("./escala-con-nexus-server")>();
  return {
    ...real,
    proponerEnLaEscala: async (_q: unknown, d: { pedido: string; foco?: string | null; antes?: { hablado: string; dichoPorLaPersona: string } }) => {
      pedidosALaEscala.push({ pedido: d.pedido, foco: d.foco ?? null, antes: d.antes });
      return { ok: true, propuesta: { ...PROPUESTA_DE_LA_ESCALA, pedido: d.pedido }, nombre: "Resumen" };
    },
    antesDePedirleALaEscala: async () => topeDeLaEscala,
  };
});

import { prisma } from "@/lib/db/prisma";
import { esDeNexusConversando } from "@/lib/ai/tope-de-nexus";
import { sinLasDelChat } from "@/lib/agents/corridas-del-chat";
import { tomarHilo } from "@/lib/nexus-chat/candado-server";
import { hechosFueraDeSuCliente } from "@/lib/invariantes/hechos";
import { olvidarHechosMirado } from "@/lib/seguimiento/hechos-server";
import { MODO_DEL_CHAT } from "@/lib/chat-de-nexus/conversacion-server";
import { TOPES } from "@/lib/chat-de-nexus/conversacion";
import { PREGUNTAS_POR_DIA } from "@/lib/chat-de-nexus/respuesta";
import { alGuardarLaNota, aplicarEnLaPreventa, cerrarEnLaPreventa, conversacionEnLaPreventa, estadosDeLaEscalaEnLaPreventa, estadosEnLaPreventa, vueltaEnLaPreventa } from "./nexus-en-la-preventa-server";
import { hechosDeLasNotas } from "./hechos-de-las-notas-server";
import { RESPUESTA_SIN_ACCESO } from "@/lib/chat-de-nexus/guardada";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { aplicarCambios } from "./servidor";
import { _olvidarElGastoDeNexus } from "@/lib/ai/tope-de-nexus-server";

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
  _olvidarElGastoDeNexus();
  siguiente = LISTO;
  tareaQuePropone = "Llamar a Ana";
  pideUnaNota = false;
  pedidosALaCuenta.length = 0;
  contextos.length = 0;
  fallaLaRespuesta = false;
  pedidos.length = 0;
  pedidosALaEscala.length = 0;
  topeDeLaEscala = { ok: true };
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

  it("un «gracias» no llama a la IA, no deja corrida ni propone guardar (22 nov)", async () => {
    const { id } = await sembrar();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "¡Gracias, Nexus!" }], EMAIL, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("cortesia");
    expect(pedidos).toHaveLength(0);
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL } })).toBe(0);
  });

  it("el tope del mes de Nexus conversando: avisa desde US$ 80 y frena en US$ 100, sin contar otras IA (22 nov)", async () => {
    const { id } = await sembrar();
    await prisma.llmCall.createMany({
      data: [
        { model: "claude-sonnet-4-6", costUsd: 60, origen: "chat:preventa" },
        { model: "claude-haiku-4-5", costUsd: 25, origen: "impacto:escala" },
        { model: "claude-sonnet-4-6", costUsd: 500, origen: "tareas/chat" },
      ],
    });
    const conAviso = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(conAviso).toMatchObject({ ok: true, aviso: "Este mes Nexus lleva US$ 85 de los US$ 100 que tiene para conversar." });

    await prisma.llmCall.create({ data: { model: "claude-sonnet-4-6", costUsd: 15, origen: "chat:preventa:respuesta" } });
    _olvidarElGastoDeNexus();
    const pedidosAntes = pedidos.length;
    const frenada = await vueltaEnLaPreventa(id, "conv-de-prueba-2", [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(frenada).toMatchObject({ ok: false, status: 429 });
    expect(pedidos.length).toBe(pedidosAntes);
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

describe("un solo contexto: La escala en la misma conversación (25 nov, TEC · AE)", () => {
  const CHIP = { lugar: { pagina: "resumen" as const }, foco: "El problema principal" };

  it("con el chip, una pregunta se responde y un pedido de cambio deja su propuesta en la vuelta; al volver, la conversación la trae", async () => {
    const { id, clientId } = await sembrar();
    await prisma.firefliesSession.create({
      data: { id: "ses-escala", title: "Diagnóstico", date: new Date("2026-11-10T15:00:00Z"), participants: ["ana@centauro.test"], resolvedClientId: clientId, transcript: "Ana Mora: La cobranza la hacemos a mano con un Excel." },
    });
    const pregunta = { de: "persona" as const, texto: "¿Qué información tienes sobre el problema principal?" };
    const r1 = await vueltaEnLaPreventa(id, CONVERSACION, [pregunta], EMAIL, CON_ACCESO, { escala: CHIP });
    expect(r1.ok && r1.turno.tipo).toBe("respuesta");
    expect(pedidosALaEscala).toHaveLength(0);
    if (!r1.ok || r1.turno.tipo !== "respuesta") return;
    const conLaRespuesta = [{ ...pregunta, es: "consulta" as const }, { de: "nexus" as const, es: "respuesta" as const, texto: r1.turno.respuesta.texto }];
    const pedido = { de: "persona" as const, texto: "Acóplalo más al reto de Fundatec" };
    const r2 = await vueltaEnLaPreventa(id, CONVERSACION, [...conLaRespuesta, pedido], EMAIL, CON_ACCESO, { escala: CHIP });
    if (!r2.ok || r2.turno.tipo !== "escala") throw new Error(`esperaba escala: ${JSON.stringify(r2)}`);
    expect(r2.turno.escala).toMatchObject({ lugar: { pagina: "resumen" }, foco: "El problema principal", nombre: "Resumen", estados: {} });
    // ⛔ A quien escribe la página no le llega lo que Nexus respondió de la cuenta (salió de una reunión).
    expect(pedidosALaEscala[0]).toMatchObject({ pedido: "Acóplalo más al reto de Fundatec", foco: "El problema principal", antes: { hablado: "", dichoPorLaPersona: "" } });
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.mensajes.map((m) => [m.de, m.es ?? null])).toEqual([
      ["persona", "consulta"],
      ["nexus", "respuesta"],
      ["persona", "cambio"],
      ["nexus", "escala"],
    ]);
    expect(c?.mensajes[3].escala).toMatchObject({ id: r2.turno.escala.id, propuesta: { cambios: PROPUESTA_DE_LA_ESCALA.cambios } });
  });

  it("lo hecho con cada cambio vuelve al recargar; otra persona y otra preventa no lo pueden anotar", async () => {
    const { id, clientId } = await sembrar();
    const r = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "Acóplalo más al reto de Fundatec" }], EMAIL, CON_ACCESO, { escala: CHIP });
    if (!r.ok || r.turno.tipo !== "escala") throw new Error("esperaba escala");
    const vuelta = r.turno.escala.id;
    expect((await estadosDeLaEscalaEnLaPreventa(id, CONVERSACION, vuelta, EMAIL, { "r/negocio:tesis:n1": "aplicado", "r/punto:nuevo": "descartado", "r/inventada": "aplicado" })).ok).toBe(true);
    // Deshacer deja lo aplicado otra vez pendiente.
    expect((await estadosDeLaEscalaEnLaPreventa(id, CONVERSACION, vuelta, EMAIL, { "r/negocio:tesis:n1": "pendiente" })).ok).toBe(true);
    expect((await estadosDeLaEscalaEnLaPreventa(id, CONVERSACION, vuelta, "marco@smarteam.test", { "r/punto:nuevo": "aplicado" })).ok).toBe(false);
    await prisma.exploracionDeVenta.update({ where: { id }, data: { archivadaEn: new Date() } });
    const hermana = (await prisma.exploracionDeVenta.create({ data: { clientId, creadaPor: EMAIL }, select: { id: true } })).id;
    expect((await estadosDeLaEscalaEnLaPreventa(hermana, CONVERSACION, vuelta, EMAIL, { "r/punto:nuevo": "aplicado" })).ok).toBe(false);
    await prisma.exploracionDeVenta.update({ where: { id: hermana }, data: { archivadaEn: new Date() } });
    await prisma.exploracionDeVenta.update({ where: { id }, data: { archivadaEn: null } });
    const c = await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO);
    expect(c?.mensajes[1].escala?.estados).toEqual({ "r/punto:nuevo": "descartado" });
  });

  it("cuando el modelo decide que era un cambio y el tope lo frena, la vuelta queda medida pero no cuenta (segunda revisión)", async () => {
    const { id } = await sembrar();
    topeDeLaEscala = { ok: false, status: 429, error: "Hoy ya le hiciste 20 pedidos a Nexus, el tope del día. Mañana sigues." };
    siguiente = { tipo: "cambio" };
    // Con el chip, lo que nombra la cuenta lo decide el modelo: acá dice «cambio».
    const r = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "Ponlo en la guía de la escala" }], EMAIL, CON_ACCESO, { escala: CHIP });
    expect(r).toMatchObject({ ok: false, status: 429 });
    const corridas = await prisma.agentRun.findMany({ where: { triggeredByEmail: EMAIL }, select: { status: true, filters: true } });
    expect(corridas).toHaveLength(1);
    expect(corridas[0]).toMatchObject({ status: "ERROR", filters: { modo: "chat-de-nexus-frenada" } });
    // No cuenta como vuelta de la conversación: la siguiente sigue con las 12.
    siguiente = { tipo: "pregunta", preguntas: ["¿De qué mes?"] };
    const sigue = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: NOTA }], EMAIL, CON_ACCESO);
    expect(sigue.ok && sigue.quedan).toBe(TOPES.turnosPorConversacion - 1);
  });

  it("sin chip, un cambio a la página solo si hay Resumen armado; con el tope de pedidos del día, no se gasta una vuelta", async () => {
    const { id } = await sembrar();
    // Sin Resumen armado no hay página que cambiar: «Cambia el titular…» no va a La escala.
    siguiente = { tipo: "pregunta", preguntas: ["¿A qué te refieres?"] };
    const sin = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "Cambia el titular a algo sobre Fundatec" }], EMAIL, CON_ACCESO);
    expect(sin.ok && sin.turno.tipo).not.toBe("escala");
    expect(pedidosALaEscala).toHaveLength(0);
    // Con el chip y el tope del día cumplido: 429 sin corrida nueva.
    topeDeLaEscala = { ok: false, status: 429, error: "Hoy ya le hiciste 20 pedidos a Nexus, el tope del día. Mañana sigues." };
    const antes = await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL } });
    const frenado = await vueltaEnLaPreventa(id, "conv-tope", [{ de: "persona", texto: "Acóplalo más al reto de Fundatec" }], EMAIL, CON_ACCESO, { escala: CHIP });
    expect(frenado).toMatchObject({ ok: false, status: 429 });
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL } })).toBe(antes);
  });
});

describe("las corridas del chat no van al feed de corridas, y las demás sí (25 nov)", () => {
  it("⛔ deja afuera la vuelta, la respuesta, el chat de la cuenta, La escala y la revisión de una nota; nunca una corrida con agente o rótulo vacío", async () => {
    const { clientId } = await sembrar();
    const corrida = (agentSlug: string | null, stepLabel: string | null) => ({ agentSlug, stepLabel, clientId, status: "DONE" as const, triggeredByEmail: EMAIL });
    await prisma.agentRun.createMany({
      data: [
        corrida("exploracion-de-venta", "Hablar con Nexus"),
        corrida("exploracion-de-venta", "Nexus responde sobre la cuenta"),
        corrida("nexus-chat", "Chat de Nexus"),
        corrida("pedirle-a-nexus", "Pedirle a Nexus · La escala › Resumen"),
        corrida("exploracion-de-venta", "¿La nota cambia La escala?"),
        corrida("exploracion-de-venta", "Armar el Resumen de La escala"),
        corrida("handoff", null),
        corrida(null, "Un agente sin slug"),
        corrida(null, null),
      ],
    });
    const quedan = await prisma.agentRun.findMany({ where: { AND: [{ triggeredByEmail: EMAIL }, sinLasDelChat()] }, select: { agentSlug: true, stepLabel: true } });
    expect(quedan.map((r) => `${r.agentSlug ?? "-"}|${r.stepLabel ?? "-"}`).sort()).toEqual(["-|-", "-|Un agente sin slug", "exploracion-de-venta|Armar el Resumen de La escala", "handoff|-"]);
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

describe("quitar o editar una nota se lleva los hechos que ya no dice (22 nov)", () => {
  const general = parsearEscala(leerArchivoDeLaEscala("escala"));
  const hecho = (clientId: string, exploracionId: string, frase: string, cita: string) => ({
    clientId,
    exploracionId,
    notaClave: CLAVE,
    dichoPorEmail: EMAIL,
    tipo: "cuenta",
    frase,
    cita,
    citaFuente: "texto",
    huella: `cuenta|${frase}`,
    fechaDeLaReunion: new Date("2026-11-21T15:00:00Z"),
  });

  async function conDosHechos() {
    const s = await sembrar();
    await guardarLaNota(s.id);
    await prisma.hechoDeReunion.createMany({
      data: [
        hecho(s.clientId, s.id, "La empresa pierde plata por su cartera", "pierden unos 40 mil dólares al mes"),
        hecho(s.clientId, s.id, "Lo confirmó el gerente", "El gerente nos confirmó"),
      ],
    });
    return s;
  }

  it("al quitar la nota se van todos sus hechos", async () => {
    const { id } = await conDosHechos();
    const r = await aplicarCambios(id, 0, [{ op: "nota", paso: CLAVE, texto: "" }], general, { quienPide: EMAIL });
    expect(r.estado).toBe("ok");
    expect(await prisma.hechoDeReunion.count({ where: { exploracionId: id } })).toBe(0);
  });

  it("al editarla se queda el hecho que sigue escrito y se va el que no", async () => {
    const { id } = await conDosHechos();
    const r = await aplicarCambios(id, 0, [{ op: "nota", paso: CLAVE, texto: "Pierden unos 40 mil dólares al mes, según la contadora." }], general, { quienPide: EMAIL });
    expect(r.estado).toBe("ok");
    const quedan = await prisma.hechoDeReunion.findMany({ where: { exploracionId: id }, select: { frase: true } });
    expect(quedan.map((h) => h.frase)).toEqual(["La empresa pierde plata por su cartera"]);
  });

  it("no toca los hechos de una reunión del mismo cliente", async () => {
    const { id, clientId } = await conDosHechos();
    const sesion = await prisma.firefliesSession.create({ data: { id: "s-de-prueba-1", title: "Reunión con Centauro", date: new Date("2026-11-20T15:00:00Z"), resolvedClientId: clientId }, select: { id: true } });
    await prisma.hechoDeReunion.create({
      data: { clientId, sessionId: sesion.id, tipo: "cuenta", frase: "De la reunión", cita: "pierden unos 40 mil dólares al mes", citaFuente: "transcripcion", huella: "cuenta|reunion", fechaDeLaReunion: new Date("2026-11-20T15:00:00Z") },
    });
    await aplicarCambios(id, 0, [{ op: "nota", paso: CLAVE, texto: "" }], general, { quienPide: EMAIL });
    expect(await prisma.hechoDeReunion.count({ where: { clientId } })).toBe(1);
    expect(await prisma.hechoDeReunion.count({ where: { sessionId: sesion.id } })).toBe(1);
  });

  it("no toca los hechos de otra preventa con la misma clave de nota", async () => {
    const { id } = await conDosHechos();
    const otra = await sembrar2();
    const deOtra = await prisma.exploracionDeVenta.findUniqueOrThrow({ where: { id: otra }, select: { clientId: true } });
    await prisma.hechoDeReunion.create({ data: hecho(deOtra.clientId, otra, "De otra preventa", "pierden unos 40 mil dólares al mes") });
    await aplicarCambios(id, 0, [{ op: "nota", paso: CLAVE, texto: "" }], general, { quienPide: EMAIL });
    expect(await prisma.hechoDeReunion.count({ where: { exploracionId: otra } })).toBe(1);
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

  it("«Guardarlo como nota»: con `contar`, lo que Nexus tomó por una pregunta se cuenta, y la respuesta no vuelve", async () => {
    const { id } = await sembrar();
    // Sin signo de pregunta: lo decidió el modelo y lo tomó por una consulta. Desde el 25 nov, una pregunta de verdad
    // («¿Sabías que…?») no se guarda como nota (la prueba de abajo).
    const TEXTO = "La cobranza la hacen a mano con un Excel";
    siguiente = { tipo: "consulta" };
    // Primero Nexus lo tomó como pregunta y respondió.
    const antes = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: TEXTO }], EMAIL, CON_ACCESO);
    if (!antes.ok || antes.turno.tipo !== "respuesta") throw new Error("esperaba una respuesta");
    pedidos.length = 0;
    // Al contarlo, Nexus encuentra lo del cliente (un hecho): sin eso no habría nada que guardar.
    siguiente = { tipo: "listo", cambios: [], hechos: [{ tipo: "proceso_hoy", frase: "La empresa cobra a mano con un Excel", cita: "La cobranza la hacen a mano con un Excel" }] };
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

  it("⛔ «Guardarlo como nota» con una pregunta, un pedido o un «gracias»: no se cuenta, no llama a la IA ni gasta una vuelta (25 nov, TEC · AE)", async () => {
    const { id } = await sembrar();
    for (const texto of ["cuales son los retos principales del AE?", "¿Sabías que cobran a mano con un Excel?", "Crea una tarea para llamar a Ana el viernes", "gracias"]) {
      const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto }], EMAIL, CON_ACCESO, { contar: true });
      expect(v, texto).toMatchObject({ ok: false, status: 400 });
    }
    expect(pedidos).toHaveLength(0);
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: EMAIL } })).toBe(0);
  });

  it("⛔ «Guardarlo como nota» de una pregunta sin signo: si Nexus no encuentra nada del cliente, no hay nada que guardar y la vuelta no vuelve", async () => {
    const { id } = await sembrar();
    siguiente = { tipo: "listo", cambios: [], hechos: [] };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: "Oye, cuales son los retos principales del AE" }], EMAIL, CON_ACCESO, { contar: true });
    expect(v).toMatchObject({ ok: false, status: 422 });
    // Al modelo se le dijo que de una pregunta no saque un hecho.
    expect(pedidos[0]).toContain("no inventes un hecho de una pregunta");
    const corrida = await prisma.agentRun.findFirstOrThrow({ where: { triggeredByEmail: EMAIL }, select: { status: true } });
    expect(corrida.status).toBe("ERROR");
    // Al volver no aparece un «Guardar» de esa pregunta.
    expect(await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO)).toBeNull();
  });

  it("⛔ «Guardarlo como nota»: un hecho cuya cita la persona no escribió, o una pregunta de Nexus, tampoco son algo que guardar", async () => {
    const { id } = await sembrar();
    const PREGUNTA = [{ de: "persona" as const, texto: "Oye, cuales son los retos principales del AE" }];
    // Lo que pasó en la tercera revisión: el modelo saca un hecho de lo que sabe (los retos) con una cita que ella no dijo.
    siguiente = { tipo: "listo", cambios: [], hechos: [{ tipo: "reto", frase: "No tienen un CRM", cita: "no tienen un CRM" }] };
    expect(await vueltaEnLaPreventa(id, CONVERSACION, PREGUNTA, EMAIL, CON_ACCESO, { contar: true })).toMatchObject({ ok: false, status: 422 });
    // Un cambio con una cita que no calza se descarta: tampoco cuenta.
    siguiente = { tipo: "listo", cambios: [{ destino: "negocio", valor: { cartera: "US$ 40.000 al mes vencidos" }, porque: "Es lo que pierden.", cita: "pierden unos 40 mil dólares al mes" }], hechos: [] };
    expect(await vueltaEnLaPreventa(id, CONVERSACION, PREGUNTA, EMAIL, CON_ACCESO, { contar: true })).toMatchObject({ ok: false, status: 422 });
    // Si el modelo pregunta («¿Qué quieres contar de los retos?»), no hay pregunta: la respuesta se juntaría con la pregunta.
    siguiente = { tipo: "pregunta", preguntas: ["¿Qué quieres contar de los retos?"] };
    expect(await vueltaEnLaPreventa(id, CONVERSACION, PREGUNTA, EMAIL, CON_ACCESO, { contar: true })).toMatchObject({ ok: false, status: 422 });
    expect(pedidos.at(-1)).toContain("YA NO PREGUNTES");
    expect(await conversacionEnLaPreventa(id, EMAIL, CON_ACCESO)).toBeNull();
  });

  it("⛔ con un mensaje más largo que la nota, un cambio que cita lo de antes del corte no se propone (la nota no lo respalda)", async () => {
    const { id } = await sembrar();
    const texto = `Ojo: pierden unos 40 mil dólares al mes en cartera vencida. ${"a".repeat(6_000)} Tienen 3 sedes en Guatemala`;
    siguiente = LISTO;
    const v = await vueltaEnLaPreventa(id, `${CONVERSACION}-largo`, [{ de: "persona", texto }], EMAIL, CON_ACCESO);
    if (!v.ok || v.turno.tipo !== "listo") throw new Error("esperaba un listo");
    expect(v.turno.cambios).toEqual([]);
    expect(v.turno.descartados).toBe(1);
    // Con el mismo texto corto, el cambio sí se propone.
    const corto = await vueltaEnLaPreventa(id, `${CONVERSACION}-corto`, [{ de: "persona", texto: "Ojo: pierden unos 40 mil dólares al mes en cartera vencida." }], EMAIL, CON_ACCESO);
    expect(corto.ok && corto.turno.tipo === "listo" && corto.turno.cambios.length).toBe(1);
  });

  it("«Guardarlo como nota» de algo corto que la persona sí dijo («¿Unos 40?» a La escala, «Usan SAP, ¿lo anoto?») se cuenta", async () => {
    const { id } = await sembrar();
    for (const [n, texto, cita] of [
      ["1", "Sobre Ventas · Datos (cuántos vendedores tienen): ¿Unos 40?", "Unos 40"],
      ["2", "Usan SAP, ¿lo anoto?", "Usan SAP"],
    ]) {
      siguiente = { tipo: "listo", cambios: [], hechos: [{ tipo: "cuenta", frase: "Lo que contó", cita }] };
      const v = await vueltaEnLaPreventa(id, `${CONVERSACION}-${n}`, [{ de: "persona", texto }], EMAIL, CON_ACCESO, { contar: true });
      expect(v.ok && v.turno.tipo, texto).toBe("listo");
    }
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
    expect(pedidos[0]).toContain("PUEDE SER ALGO QUE CUENTA, UNA PREGUNTA O UN PEDIDO");
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

describe("una sola conversación: lo que se pide de la cuenta vive en el mismo hilo (24 nov)", () => {
  const PEDIDO = "Crea una tarea para llamar a Ana el viernes";
  const SA = "sa@smarteam.test";

  /** Una persona que ve la cuenta (super admin: ve todas) y la regla del chat de la cuenta que deja pedir. */
  async function conQuienPide() {
    const s = await sembrar();
    const persona = await prisma.teamMember.create({ data: { name: "Sofía Admin", email: SA, roleEnum: "SUPER_ADMIN" } });
    return { ...s, quien: async () => ({ persona, veMontos: false }) };
  }

  it("un pedido seguro va a la mano de la cuenta (sin clasificar), deja su lista y la conversación la trae", async () => {
    const { id, clientId, quien } = await conQuienPide();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: PEDIDO }], SA, CON_ACCESO, { quienPideLaCuenta: quien });
    if (!v.ok || v.turno.tipo !== "lista") throw new Error(`esperaba una lista: ${JSON.stringify(v)}`);
    expect(v.turno.lista).toMatchObject({ texto: "Te dejo la tarea en la lista.", estado: "viva" });
    expect(v.turno.lista.lineas).toEqual([expect.stringContaining("Llamar a Ana")]);
    // Sin la llamada que clasifica, y sin las notas de la cuenta (van a HubSpot).
    expect(pedidos).toHaveLength(0);
    expect(pedidosALaCuenta).toHaveLength(1);
    expect(pedidosALaCuenta[0].herramientas).not.toContain("nota_crear");
    // La lista queda en la vuelta, acotada a ESTA cuenta, aunque el modelo no la nombró.
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: v.turno.lista.id }, select: { status: true, filters: true, output: true } });
    expect(run).toMatchObject({ status: "DONE", filters: { modo: "chat-de-nexus", conversacion: CONVERSACION, exploracion: id } });
    expect(JSON.parse(run.output!).operaciones).toEqual([{ nombre: "tarea.crear", entrada: { titulo: "Llamar a Ana", clientId } }]);
    // Al volver: lo pedido y la lista, en el mismo hilo, sin las operaciones.
    const c = await conversacionEnLaPreventa(id, SA, CON_ACCESO);
    expect(c?.mensajes.map((m) => [m.de, m.es ?? null])).toEqual([
      ["persona", "pedido"],
      ["nexus", "lista"],
    ]);
    expect(c?.mensajes[1].lista?.estado).toBe("viva");
    expect(JSON.stringify(c)).not.toContain("tarea.crear");
  });

  it("«Aplicar» crea la tarea por la capa de operaciones, una sola vez; la lista queda aplicada", async () => {
    const { id, clientId, quien } = await conQuienPide();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: PEDIDO }], SA, CON_ACCESO, { quienPideLaCuenta: quien });
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    const vuelta = v.turno.lista.id;
    // Otra persona no aplica la lista de Sofía.
    expect(await aplicarEnLaPreventa(id, CONVERSACION, vuelta, [], EMAIL, quien)).toMatchObject({ ok: false, status: 404 });
    const a = await aplicarEnLaPreventa(id, CONVERSACION, vuelta, [], SA, quien);
    if (!a.ok) throw new Error(a.error);
    expect(a).toMatchObject({ yaEstaba: false, resultado: { aplicadas: 1 }, lista: { estado: "aplicada" } });
    const tareas = await prisma.tarea.findMany({ select: { titulo: true, clientId: true, origenId: true } });
    expect(tareas).toEqual([{ titulo: "Llamar a Ana", clientId, origenId: `p:${vuelta}:0` }]);
    // El segundo clic: «ya estaba», y no hay otra tarea.
    expect(await aplicarEnLaPreventa(id, CONVERSACION, vuelta, [], SA, quien)).toMatchObject({ ok: true, yaEstaba: true });
    expect(await prisma.tarea.count()).toBe(1);
    const c = await conversacionEnLaPreventa(id, SA, CON_ACCESO);
    expect(c?.mensajes[1].lista).toMatchObject({ estado: "aplicada", desenlace: expect.stringContaining("tarea") });
  });

  it("la misma memoria: la mano de la cuenta ve lo contado antes, y lo pendiente se arrastra a la lista nueva", async () => {
    const { id, quien } = await conQuienPide();
    const contado = { de: "persona" as const, texto: NOTA, es: "guardado" as const };
    const v1 = await vueltaEnLaPreventa(id, CONVERSACION, [contado, { de: "persona", texto: PEDIDO }], SA, CON_ACCESO, { quienPideLaCuenta: quien });
    if (!v1.ok || v1.turno.tipo !== "lista") throw new Error("esperaba una lista");
    expect(pedidosALaCuenta[0].mensajes).toContain("cartera vencida");
    // Sin aplicar, pide otra cosa: la primera viaja en la lista nueva (P1) y la vieja ya no se aplica.
    tareaQuePropone = "Escribirle a Juan";
    const v2 = await vueltaEnLaPreventa(
      id,
      CONVERSACION,
      [contado, { de: "persona", texto: PEDIDO, es: "pedido" }, { de: "nexus", texto: v1.turno.lista.texto, es: "lista" }, { de: "persona", texto: "Crea otra tarea para escribirle a Juan" }],
      SA,
      CON_ACCESO,
      { quienPideLaCuenta: quien },
    );
    if (!v2.ok || v2.turno.tipo !== "lista") throw new Error("esperaba otra lista");
    expect(pedidosALaCuenta[1].mensajes).toContain("P1.");
    expect(pedidosALaCuenta[1].mensajes).toContain("[La lista que propuse:");
    expect(v2.turno.lista.lineas).toHaveLength(2);
    expect(v2.turno.lista.arrastradas).toEqual([0]);
    expect(await aplicarEnLaPreventa(id, CONVERSACION, v1.turno.lista.id, [], SA, quien)).toMatchObject({ ok: false, status: 409 });
    const a = await aplicarEnLaPreventa(id, CONVERSACION, v2.turno.lista.id, [], SA, quien);
    expect(a).toMatchObject({ ok: true, resultado: { aplicadas: 2 } });
  });

  it("sin el permiso del chat de la cuenta no hay mano de la cuenta: el pedido se lee como antes, sin chocar con «sin acceso»", async () => {
    const { id } = await conQuienPide();
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: PEDIDO }], SA, CON_ACCESO, { quienPideLaCuenta: async () => null });
    if (!v.ok) throw new Error(v.error);
    // Lo leyó el modelo que clasifica (acá dice «listo»): se puede guardar como nota, como antes de juntar las conversaciones.
    expect(v.turno.tipo).toBe("listo");
    expect(pedidosALaCuenta).toHaveLength(0);
    expect(pedidos).toHaveLength(1);
  });

  it("sin la mano de la cuenta (otra superficie), lo que parece un pedido lo decide el modelo, como antes", async () => {
    const { id } = await conQuienPide();
    siguiente = { tipo: "pedido" };
    const v = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: PEDIDO }], SA, CON_ACCESO);
    if (!v.ok) throw new Error(v.error);
    // El modelo dijo «pedido» y no hay mano: se responde como una pregunta.
    expect(v.turno.tipo).toBe("respuesta");
    expect(pedidosALaCuenta).toHaveLength(0);
  });
});

describe("una sola conversación: topes, medidor, candado y lo que encontró la revisión (24 nov)", () => {
  const PEDIDO = "Crea una tarea para llamar a Ana el viernes";
  const SA = "sa@smarteam.test";

  async function conQuienPide() {
    const s = await sembrar();
    const persona = await prisma.teamMember.create({ data: { name: "Sofía Admin", email: SA, roleEnum: "SUPER_ADMIN" } });
    return { ...s, quien: async () => ({ persona, veMontos: false }) };
  }
  const pedir = (id: string, quien: () => Promise<{ persona: Awaited<ReturnType<typeof prisma.teamMember.create>>; veMontos: boolean }>, mensajes = [{ de: "persona" as const, texto: PEDIDO }], o: { contar?: boolean; soltar?: string } = {}) =>
    vueltaEnLaPreventa(id, CONVERSACION, mensajes, SA, CON_ACCESO, { quienPideLaCuenta: quien, ...o });

  it("el gasto del pedido va al agente del chat de la cuenta y entra al tope del mes de Nexus conversando", async () => {
    const { id, clientId, quien } = await conQuienPide();
    const v = await pedir(id, quien);
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    const delPedido = contextos.filter((c) => c.origen === "chat:preventa:cuenta");
    expect(delPedido.length).toBeGreaterThan(0);
    expect(delPedido[0]).toMatchObject({ agentSlug: "nexus-chat", triggeredByEmail: SA, agentRunId: v.turno.lista.id, clientId });
    expect(esDeNexusConversando(delPedido[0].origen)).toBe(true);
  });

  it("con US$ 3 gastados hoy en el chat de la cuenta, el pedido no llama al modelo", async () => {
    const { id, quien } = await conQuienPide();
    await prisma.llmCall.create({ data: { model: "claude-sonnet-4-6", agentSlug: "nexus-chat", triggeredByEmail: SA, costUsd: 3 } });
    const v = await pedir(id, quien);
    expect(v).toMatchObject({ ok: false, status: 429 });
    expect(pedidosALaCuenta).toHaveLength(0);
    // Un pedido frenado no se come una vuelta de la conversación ni del día.
    expect(await prisma.agentRun.count({ where: { triggeredByEmail: SA } })).toBe(0);
  });

  it("con el candado de la conversación tomado, pedir y aplicar dicen «ocupado» y no escriben nada", async () => {
    const { id, quien } = await conQuienPide();
    const v = await pedir(id, quien);
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    const soltar = tomarHilo(`chat-de-nexus:${SA}:${CONVERSACION}`);
    try {
      pedidosALaCuenta.length = 0;
      expect(await pedir(id, quien, [{ de: "persona", texto: "Crea otra tarea para escribirle a Juan" }])).toMatchObject({ ok: false, status: 409 });
      expect(pedidosALaCuenta).toHaveLength(0);
      expect(await aplicarEnLaPreventa(id, CONVERSACION, v.turno.lista.id, [], SA, quien)).toMatchObject({ ok: false, status: 409 });
      expect(await prisma.tarea.count()).toBe(0);
    } finally {
      soltar?.();
    }
  });

  it("una nota de la cuenta no entra: el modelo no la puede preparar, y una lista guardada que la traiga no se aplica", async () => {
    const { id, clientId, quien } = await conQuienPide();
    pideUnaNota = true;
    const v = await pedir(id, quien);
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    expect(v.turno.lista.lineas).toEqual([]);
    expect(v.turno.lista.texto).toContain("Lo que sabes del cliente");
    // Aunque una vuelta la trajera guardada: «Aplicar» no la escribe.
    pideUnaNota = false;
    const v2 = await pedir(id, quien);
    if (!v2.ok || v2.turno.tipo !== "lista") throw new Error("esperaba una lista");
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: v2.turno.lista.id }, select: { output: true } });
    const salida = JSON.parse(run.output!);
    salida.operaciones = [{ nombre: "nota.crear", entrada: { clientId, texto: "x" } }];
    await prisma.agentRun.update({ where: { id: v2.turno.lista.id }, data: { output: JSON.stringify(salida) } });
    expect(await aplicarEnLaPreventa(id, CONVERSACION, v2.turno.lista.id, [], SA, quien)).toMatchObject({ ok: false, status: 422 });
  });

  it("aplicar a medias guarda qué renglones entraron; lo desmarcado no se crea", async () => {
    const { id, quien } = await conQuienPide();
    tareaQuePropone = ["Llamar a Ana", "Escribirle a Juan"];
    const v = await pedir(id, quien);
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    expect(v.turno.lista.lineas).toHaveLength(2);
    const a = await aplicarEnLaPreventa(id, CONVERSACION, v.turno.lista.id, [1], SA, quien);
    expect(a).toMatchObject({ ok: true, lista: { estado: "aplicada", aplicados: [0] } });
    expect((await prisma.tarea.findMany({ select: { titulo: true } })).map((t) => t.titulo)).toEqual(["Llamar a Ana"]);
  });

  it("«Guardarlo como nota» debajo de una lista viva: la lista queda soltada y no se arrastra al pedido siguiente", async () => {
    const { id, quien } = await conQuienPide();
    // Lo que se leyó como pedido y contaba algo («Pasa que…»): un pedido de verdad no se guarda como nota (25 nov).
    const CONTABA = "Pasa que tienen una tarea pendiente con el banco";
    const lista = await vueltaEnLaPreventa(id, CONVERSACION, [{ de: "persona", texto: CONTABA }], SA, CON_ACCESO, { quienPideLaCuenta: quien, pedir: true });
    if (!lista.ok || lista.turno.tipo !== "lista") throw new Error("esperaba una lista");
    // La persona elige contarlo: sale el par y se cuenta, soltando la lista. Nexus saca el hecho de SUS palabras (un hecho
    // con una cita que ella no escribió no cuenta: «nada que guardar», tercera revisión del 25 nov).
    siguiente = { tipo: "listo", cambios: [], hechos: [{ tipo: "cuenta", frase: "Tienen una tarea pendiente con el banco", cita: "tienen una tarea pendiente con el banco" }] };
    const contada = await pedir(id, quien, [{ de: "persona", texto: CONTABA }], { contar: true, soltar: lista.turno.lista.id });
    expect(contada.ok && contada.turno.tipo).toBe("listo");
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: lista.turno.lista.id }, select: { output: true } });
    expect(JSON.parse(run.output!).soltada).toBe(true);
    // Lo soltado no se aplica ni viaja como pendiente.
    expect(await aplicarEnLaPreventa(id, CONVERSACION, lista.turno.lista.id, [], SA, quien)).toMatchObject({ ok: false, status: 409 });
    pedidosALaCuenta.length = 0;
    tareaQuePropone = "Escribirle a Juan";
    await pedir(id, quien, [{ de: "persona", texto: "Crea una tarea para escribirle a Juan" }]);
    expect(pedidosALaCuenta[0].mensajes).not.toContain("P1.");
  });
});

describe("«Guardarlo como nota» debajo de una lista, si la IA falla al leerlo", () => {
  it("la lista sigue viva: se puede aplicar igual", async () => {
    const SA = "sa@smarteam.test";
    const s = await sembrar();
    const persona = await prisma.teamMember.create({ data: { name: "Sofía Admin", email: SA, roleEnum: "SUPER_ADMIN" } });
    const quien = async () => ({ persona, veMontos: false });
    // Lo que se leyó como pedido y contaba algo: un pedido de verdad no se guarda como nota (25 nov).
    const CONTABA = "Pasa que tienen una tarea pendiente con Ana";
    const v = await vueltaEnLaPreventa(s.id, CONVERSACION, [{ de: "persona", texto: CONTABA }], SA, CON_ACCESO, { quienPideLaCuenta: quien, pedir: true });
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    siguiente = "esto no es un JSON";
    const contada = await vueltaEnLaPreventa(s.id, CONVERSACION, [{ de: "persona", texto: CONTABA }], SA, CON_ACCESO, {
      quienPideLaCuenta: quien,
      contar: true,
      soltar: v.turno.lista.id,
    });
    expect(contada.ok && contada.turno.tipo === "listo" && contada.turno.sinLeer).toBe(true);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: v.turno.lista.id }, select: { output: true } });
    expect(JSON.parse(run.output!).soltada).toBeUndefined();
    expect(await aplicarEnLaPreventa(s.id, CONVERSACION, v.turno.lista.id, [], SA, quien)).toMatchObject({ ok: true, resultado: { aplicadas: 1 } });
  });
});

describe("«Mejorar con IA» de la guía abre la misma conversación (24 nov)", () => {
  it("con la guía como lugar, lo que se escribe va a la mano de la cuenta, aunque sea una pregunta", async () => {
    const SA = "sa@smarteam.test";
    const s = await sembrar();
    const persona = await prisma.teamMember.create({ data: { name: "Sofía Admin", email: SA, roleEnum: "SUPER_ADMIN" } });
    tareaQuePropone = null;
    const v = await vueltaEnLaPreventa(s.id, CONVERSACION, [{ de: "persona", texto: "¿Qué otras preguntas agregarías?" }], SA, CON_ACCESO, {
      quienPideLaCuenta: async () => ({ persona, veMontos: false }),
      pedir: true,
      lugar: "guia",
    });
    if (!v.ok) throw new Error(v.error);
    expect(v.turno.tipo).toBe("lista");
    expect(pedidosALaCuenta).toHaveLength(1);
    // La mano de la cuenta tiene la guía a la vista (sus preguntas, en el mensaje).
    expect(pedidosALaCuenta[0].mensajes).toContain(GUIA_DE_PRUEBA);
    // Ni el que clasifica ni el que responde con citas: la pregunta es sobre la guía.
    expect(pedidos).toHaveLength(0);
    // Y queda en la misma conversación de la preventa.
    const c = await conversacionEnLaPreventa(s.id, SA, CON_ACCESO);
    expect(c?.mensajes.map((m) => m.es)).toEqual(["pedido", "lista"]);
  });
});

describe("sin la guía como lugar, la mano de la cuenta no la recibe (espejo)", () => {
  it("un pedido de una tarea va sin la guía", async () => {
    const SA = "sa@smarteam.test";
    const s = await sembrar();
    const persona = await prisma.teamMember.create({ data: { name: "Sofía Admin", email: SA, roleEnum: "SUPER_ADMIN" } });
    const v = await vueltaEnLaPreventa(s.id, CONVERSACION, [{ de: "persona", texto: "Crea una tarea para llamar a Ana" }], SA, CON_ACCESO, {
      quienPideLaCuenta: async () => ({ persona, veMontos: false }),
    });
    if (!v.ok || v.turno.tipo !== "lista") throw new Error("esperaba una lista");
    expect(pedidosALaCuenta[0].mensajes).not.toContain(GUIA_DE_PRUEBA);
  });
});
