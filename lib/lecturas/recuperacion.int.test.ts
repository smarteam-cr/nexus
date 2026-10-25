/**
 * lib/lecturas/recuperacion.int.test.ts — EL MODO DE RECUPERACIÓN contra una base REAL (T2, 2026-10-24).
 *
 * Lo que se prueba: qué reuniones entran (de más de 14 días, con texto —también solo notas—, sin minuta, de un cliente
 * o un prospecto, no de puertas adentro, una sola por texto repetido), que encolar deja un pedido por lote con el aviso
 * de recuperación y sin pedir lo que no se usa, y que la respuesta deja SOLO la minuta: ni propuestas de Tarea, ni
 * pedidos fuera de alcance, ni la fila de la cola. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { HERRAMIENTA_DE_LA_LECTURA } from "@/lib/sessions/lectura-salida";
import { AVISO_DE_RECUPERACION, type ContextoDeLaRecuperacion } from "@/lib/sessions/post-process";
import { sinLasRecuperadas } from "@/lib/lo-propuesto/registro-server";
import { MAX_INTENTOS_DE_RECUPERACION, candidatasDeRecuperacion, claveDelIntento, encolarRecuperacion, manejadorDeLaRecuperacion } from "./recuperacion";

vi.mock("server-only", () => ({}));

const DIA = 86_400_000;
const CONVERSACION = "Ana: les mando la base de clientes el miércoles.\nLiz: perfecto, la cargamos el jueves.\n".repeat(6);
const NOTAS = "Resumen\nRevisión de la integración con el ERP.\n\nPróximos pasos\n[Ana] Enviar la base de clientes el miércoles. ".repeat(6);

function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [{ type: "tool_use", id: "tu_1", name: HERRAMIENTA_DE_LA_LECTURA, input }],
    usage: { input_tokens: 3_000, output_tokens: 800 },
  } as unknown as Anthropic.Messages.Message;
}

describe("la recuperación de las lecturas atrasadas", () => {
  it("elige las reuniones viejas con texto y sin minuta, las encola por lote y deja solo la minuta", async () => {
    const ahora = new Date();
    const hace = (d: number) => new Date(+ahora - d * DIA);
    await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteam.test"] } });
    await prisma.agent.create({ data: { id: "agent-post-session", name: "Análisis post-sesión", systemPrompt: "Lee la reunión.", associatedStages: [] } });
    const cliente = await prisma.client.create({ data: { name: "Cliente Recuperación (test)", kind: "CLIENTE" } });
    const prospecto = await prisma.client.create({ data: { name: "Prospecto Recuperación (test)", kind: "PROSPECTO" } });
    const aliado = await prisma.client.create({ data: { name: "Aliado Recuperación (test)", kind: "ALIADO" } });
    const gente = ["ana@cliente.test", "liz@smarteam.test"];
    await prisma.firefliesSession.createMany({
      data: [
        { id: "rec-notas", title: "Solo notas, hace 30 días", date: hace(30), enrichedAt: hace(30), participants: gente, summary: { overview: NOTAS }, resolvedClientId: cliente.id },
        { id: "rec-transcripcion", title: "Con transcripción, hace 20 días", date: hace(20), enrichedAt: hace(20), participants: gente, transcript: CONVERSACION, resolvedClientId: prospecto.id },
        { id: "rec-copia", title: "La misma, en otra serie", date: hace(20), enrichedAt: hace(20), participants: gente, transcript: CONVERSACION, resolvedClientId: prospecto.id },
        { id: "rec-fresca", title: "Fresca (la lee la cola)", date: hace(3), enrichedAt: hace(3), participants: gente, transcript: CONVERSACION, resolvedClientId: cliente.id },
        { id: "rec-con-minuta", title: "Ya leída", date: hace(25), enrichedAt: hace(25), participants: gente, transcript: `${CONVERSACION} otra`, resolvedClientId: cliente.id },
        { id: "rec-adentro", title: "Puertas adentro", date: hace(25), enrichedAt: hace(25), participants: ["liz@smarteam.test", "marco@smarteam.test"], transcript: `${CONVERSACION} interna`, resolvedClientId: cliente.id },
        { id: "rec-aliado", title: "De un aliado", date: hace(25), enrichedAt: hace(25), participants: gente, transcript: `${CONVERSACION} aliado`, resolvedClientId: aliado.id },
        { id: "rec-sin-texto", title: "Sin texto", date: hace(25), enrichedAt: hace(25), participants: gente, summary: { overview: "corto" }, resolvedClientId: cliente.id },
        // La gemela (otra serie, otra ficha) de una que ya tiene minuta: mismo texto con otros espacios y mayúsculas.
        { id: "rec-gemela-leida", title: "Gemela de la ya leída", date: hace(24), enrichedAt: hace(24), participants: gente, transcript: `${CONVERSACION.replace(/ /g, "  ")}   OTRA`, resolvedClientId: prospecto.id },
        { id: "rec-muy-vieja", title: "Antes del desde", date: hace(200), enrichedAt: hace(200), participants: gente, transcript: `${CONVERSACION} vieja`, resolvedClientId: cliente.id },
        // ⚠ Gemelas ya leídas FUERA de las fechas de la búsqueda: una reciente (la leyó la cola) y una anterior al
        // `desde`. Una «optimización» que le ponga a las ya leídas la ventana de las candidatas las dejaría de ver, y su
        // par se pagaría dos veces.
        { id: "rec-leida-reciente", title: "Leída por la cola, hace 5 días", date: hace(5), enrichedAt: hace(5), participants: gente, transcript: `${CONVERSACION} reciente`, resolvedClientId: cliente.id },
        { id: "rec-par-de-la-reciente", title: "Su par, hace 30 días", date: hace(30), enrichedAt: hace(30), participants: gente, transcript: `${CONVERSACION} reciente`, resolvedClientId: prospecto.id },
        { id: "rec-leida-antigua", title: "Leída hace 200 días", date: hace(200), enrichedAt: hace(200), participants: gente, transcript: `${CONVERSACION} antigua`, resolvedClientId: cliente.id },
        { id: "rec-par-de-la-antigua", title: "Su par, hace 40 días", date: hace(40), enrichedAt: hace(40), participants: gente, transcript: `${CONVERSACION} antigua`, resolvedClientId: cliente.id },
      ],
    });
    await prisma.sessionMinute.create({ data: { sessionId: "rec-con-minuta", summary: "ya estaba" } });
    await prisma.sessionMinute.create({ data: { sessionId: "rec-leida-reciente", summary: "la leyó la cola" } });
    await prisma.sessionMinute.create({ data: { sessionId: "rec-leida-antigua", summary: "de hace meses" } });

    const { candidatas, fuera, total } = await candidatasDeRecuperacion({ desde: hace(90), limite: 10, soloActivas: false, ahora });
    // La copia (mismo texto, mismo dueño) entra una vez; la más nueva primero.
    const ids = candidatas.map((c) => c.sessionId).sort();
    expect(ids).toHaveLength(2);
    expect(ids).toContain("rec-notas");
    expect(ids.filter((id) => id === "rec-transcripcion" || id === "rec-copia")).toHaveLength(1);
    expect(total).toBe(2);
    expect(fuera.copias, "la copia de la misma corrida, la gemela de una ya leída (aunque sea de otra ficha) y las pares de dos ya leídas fuera de las fechas").toBe(4);
    expect(ids).not.toContain("rec-par-de-la-reciente");
    expect(ids).not.toContain("rec-par-de-la-antigua");
    expect(fuera.puertasAdentro).toBe(1);
    expect(candidatas.find((c) => c.sessionId === "rec-notas")?.clase).toBe("solo_notas");

    // Por empresas activas (por defecto): ninguna de estas lo es.
    expect((await candidatasDeRecuperacion({ desde: hace(90), limite: 10, ahora })).candidatas).toEqual([]);
    // Con una preventa viva, el prospecto pasa a ser activo.
    await prisma.exploracionDeVenta.create({ data: { clientId: prospecto.id, creadaPor: "liz@smarteam.test" } });
    expect((await candidatasDeRecuperacion({ desde: hace(90), limite: 10, ahora })).candidatas.map((c) => c.clientId)).toEqual([prospecto.id]);
    // Con un proyecto de cartera (activo, de la empresa), el cliente también.
    await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
    expect(new Set((await candidatasDeRecuperacion({ desde: hace(90), limite: 10, ahora })).candidatas.map((c) => c.clientId))).toEqual(new Set([prospecto.id, cliente.id]));

    // Encolar: un pedido por lote por reunión, con el aviso y sin pedir pedidos fuera de alcance ni la fecha del diagnóstico.
    const encoladas = await encolarRecuperacion(["rec-notas", "rec-fresca"], "elias@smarteam.test");
    expect(encoladas.find((e) => e.sessionId === "rec-notas")?.estado).toBe("encolada");
    // Una fresca la lee la cola, entera: la recuperación no la toca.
    expect(encoladas.find((e) => e.sessionId === "rec-fresca")?.estado).toBe("fresca");
    const pedido = await prisma.pedidoEnLote.findUniqueOrThrow({ where: { claveUnica: claveDelIntento("rec-notas", 1) } });
    expect(pedido.tipo).toBe("lectura-recuperacion");
    const params = pedido.pedido as { messages: { content: string }[]; tools: { input_schema: { properties: Record<string, unknown> } }[] };
    expect(params.messages[0].content).toContain(AVISO_DE_RECUPERACION);
    expect(params.messages[0].content).toContain("=== NOTAS DE GEMINI (no hay transcripción de esta reunión) ===");
    expect(Object.keys(params.tools[0].input_schema.properties)).not.toContain("fueraDeAlcance");
    expect(Object.keys(params.tools[0].input_schema.properties)).not.toContain("presentacionDiagnostico");
    // Lo mismo no se encola dos veces.
    expect((await encolarRecuperacion(["rec-notas"], "elias@smarteam.test"))[0].estado).toBe("ya_estaba");
    const contexto = pedido.contexto as unknown as ContextoDeLaRecuperacion;
    expect(contexto).toMatchObject({ sessionId: "rec-notas", clientId: cliente.id, fuente: "notas", quien: "elias@smarteam.test" });
    expect(manejadorDeLaRecuperacion.quienPidio?.(contexto)).toBe("elias@smarteam.test");

    // La respuesta: solo la minuta y los temas. Los compromisos que el modelo igual mande no se escriben.
    const r = await manejadorDeLaRecuperacion.aplicar({
      pedidoId: pedido.id,
      contexto,
      mensaje: respuesta({
        minuta: { summary: "Se revisó la integración con el ERP.", agreements: [{ text: "Ana envía la base" }], decisions: [], risks: [], topics: ["integración"] },
        compromisos: [{ texto: "Enviar la base de clientes", cita: "Enviar la base de clientes el miércoles", lado: "cliente" }],
        detectedTopics: ["ERP"],
      }),
    });
    expect(r.agentRunId).toBeTruthy();
    const minuta = await prisma.sessionMinute.findUniqueOrThrow({ where: { sessionId: "rec-notas" } });
    expect(minuta).toMatchObject({ summary: "Se revisó la integración con el ERP.", status: "DRAFT", generatedByAgentRunId: r.agentRunId });
    const corrida = await prisma.agentRun.findUniqueOrThrow({ where: { id: r.agentRunId! } });
    expect(corrida).toMatchObject({ status: "DONE", triggeredByEmail: "elias@smarteam.test", clientId: cliente.id });
    expect(JSON.parse(corrida.output ?? "{}")).toMatchObject({ recuperacion: true, fuente: "notas" });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "rec-notas" }, select: { detectedTopics: true } })).detectedTopics).toEqual(["erp"]);
    expect(await prisma.tarea.count()).toBe(0);
    expect(await prisma.pedidoFueraDeAlcance.count()).toBe(0);
    expect(await prisma.lecturaDeReunion.count({ where: { sessionId: "rec-notas" } })).toBe(0);
    // «Uso de Nexus» no la cuenta como una minuta nacida hoy; la de una lectura normal, sí.
    const normal = await prisma.agentRun.create({ data: { agentId: "agent-post-session", clientId: cliente.id, status: "DONE", stepLabel: "Análisis post-sesión" }, select: { id: true } });
    expect(await sinLasRecuperadas(prisma, [{ generatedByAgentRunId: r.agentRunId ?? null }, { generatedByAgentRunId: normal.id }, { generatedByAgentRunId: null }])).toEqual([
      { generatedByAgentRunId: normal.id },
      { generatedByAgentRunId: null },
    ]);

    // Si la leyeron mientras esperaba (ya tiene minuta), lo que vuelve no pisa nada.
    const otra = await manejadorDeLaRecuperacion.aplicar({ pedidoId: pedido.id, contexto, mensaje: respuesta({ minuta: { summary: "otra" } }) });
    expect(otra.agentRunId).toBeNull();
    expect((await prisma.sessionMinute.findUniqueOrThrow({ where: { sessionId: "rec-notas" } })).summary).toBe("Se revisó la integración con el ERP.");
  });

  it("lo que vuelve sin minuta se puede reintentar (hasta 3), la copia en camino no se manda dos veces, y no se escribe nada ajeno", async () => {
    const ahora = new Date();
    const hace = (d: number) => new Date(+ahora - d * DIA);
    await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteam.test"] } });
    await prisma.agent.create({ data: { id: "agent-post-session", name: "Análisis post-sesión", systemPrompt: "Lee la reunión.", associatedStages: [] } });
    const x = await prisma.client.create({ data: { name: "Antes X (test)", kind: "CLIENTE" } });
    const y = await prisma.client.create({ data: { name: "Ahora Y (test)", kind: "CLIENTE" } });
    const proyectoDeX = await prisma.project.create({ data: { clientId: x.id, name: "Proyecto de X (test)" } });
    const gente = ["ana@cliente.test", "liz@smarteam.test"];
    await prisma.firefliesSession.createMany({
      data: [
        { id: "r-movida", title: "Era de X, ahora de Y", date: hace(30), enrichedAt: hace(30), participants: gente, transcript: CONVERSACION, resolvedClientId: y.id },
        { id: "r-serie-a", title: "Serie A", date: hace(20), enrichedAt: hace(20), participants: gente, transcript: `${CONVERSACION} serie`, resolvedClientId: y.id },
        { id: "r-serie-b", title: "Serie B", date: hace(20), enrichedAt: hace(20), participants: gente, transcript: `${CONVERSACION} serie`, resolvedClientId: y.id },
      ],
    });
    // El vínculo viejo con el proyecto del dueño anterior.
    await prisma.sessionProject.create({ data: { sessionId: "r-movida", projectId: proyectoDeX.id, isPrimary: true } });

    // El proyecto de otro cliente no entra al pedido (invariante 1).
    const [primera] = await encolarRecuperacion(["r-movida"], "elias@smarteam.test");
    expect(primera.estado).toBe("encolada");
    const pedido = await prisma.pedidoEnLote.findUniqueOrThrow({ where: { claveUnica: claveDelIntento("r-movida", 1) } });
    expect(pedido.projectId).toBeNull();
    expect(JSON.stringify(pedido.pedido)).not.toContain("Proyecto de X");
    const contexto = pedido.contexto as unknown as ContextoDeLaRecuperacion;

    // Una respuesta cortada lanza (el pedido queda en error) y no escribe nada.
    await expect(manejadorDeLaRecuperacion.aplicar({ pedidoId: pedido.id, contexto, mensaje: { ...respuesta({ minuta: { summary: "x" } }), stop_reason: "max_tokens" } })).rejects.toThrow(/se cortó/);
    // Apagada mientras esperaba: no escribe.
    process.env.LECTURA_DE_RECUPERACION = "0";
    try {
      expect((await manejadorDeLaRecuperacion.aplicar({ pedidoId: pedido.id, contexto, mensaje: respuesta({ minuta: { summary: "apagada" } }) })).agentRunId).toBeNull();
      expect((await encolarRecuperacion(["r-movida"], "elias@smarteam.test"))[0].estado).toBe("apagada");
    } finally {
      delete process.env.LECTURA_DE_RECUPERACION;
    }
    // Cambió de dueño mientras esperaba: no escribe.
    expect((await manejadorDeLaRecuperacion.aplicar({ pedidoId: pedido.id, contexto: { ...contexto, clientId: x.id }, mensaje: respuesta({ minuta: { summary: "ajena" } }) })).agentRunId).toBeNull();
    expect(await prisma.sessionMinute.count({ where: { sessionId: "r-movida" } })).toBe(0);

    // Mientras el primer intento está vivo, no se duplica; cuando vuelve sin minuta, se reintenta con otro número.
    expect((await encolarRecuperacion(["r-movida"], "elias@smarteam.test"))[0].estado).toBe("ya_estaba");
    await prisma.pedidoEnLote.update({ where: { id: pedido.id }, data: { estado: "error" } });
    expect((await candidatasDeRecuperacion({ desde: hace(90), limite: 10, soloActivas: false, ahora })).candidatas.map((c) => c.sessionId)).toContain("r-movida");
    for (let n = 2; n <= MAX_INTENTOS_DE_RECUPERACION; n++) {
      expect((await encolarRecuperacion(["r-movida"], "elias@smarteam.test"))[0].estado).toBe("encolada");
      await prisma.pedidoEnLote.update({ where: { claveUnica: claveDelIntento("r-movida", n) }, data: { estado: "vencido" } });
    }
    // A la tercera, ni se propone ni se encola.
    const despues = await candidatasDeRecuperacion({ desde: hace(90), limite: 10, soloActivas: false, ahora });
    expect(despues.candidatas.map((c) => c.sessionId)).not.toContain("r-movida");
    expect(despues.fuera.agotadas).toBe(1);
    expect((await encolarRecuperacion(["r-movida"], "elias@smarteam.test"))[0].estado).toBe("agotada");

    // La misma reunión en dos series: con una en camino, la otra queda como copia en la corrida siguiente.
    const antes = await candidatasDeRecuperacion({ desde: hace(90), limite: 10, soloActivas: false, ahora });
    const serie = antes.candidatas.filter((c) => c.sessionId.startsWith("r-serie")).map((c) => c.sessionId);
    expect(serie).toHaveLength(1);
    expect((await encolarRecuperacion(serie, "elias@smarteam.test"))[0].estado).toBe("encolada");
    const luego = await candidatasDeRecuperacion({ desde: hace(90), limite: 10, soloActivas: false, ahora });
    expect(luego.candidatas.filter((c) => c.sessionId.startsWith("r-serie"))).toEqual([]);
    expect(luego.fuera.enCurso + luego.fuera.copias).toBe(2);
  });
});
