/**
 * lib/sessions/lectura-solo-notas.int.test.ts — T2 contra una base REAL: la lectura de siempre lee ENTERA una reunión
 * con solo notas de Gemini (2026-10-24).
 *
 * Lo que se prueba: que las notas llegan a la IA como el texto de la reunión (con su aviso, una sola vez, sin un
 * «TRANSCRIPT» vacío), que queda la minuta con la fuente «notas», y que con `SEGUIMIENTO_SOLO_NOTAS=0` no se llama a la
 * IA. La IA está simulada: se mira el pedido, no la respuesta. Correr con la base local: `npm run test:int`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

vi.mock("server-only", () => ({}));
const crear = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } }, getAnthropic: () => ({ messages: { create: crear } }) }));

import { prisma } from "@/lib/db/prisma";
import { leerAhora } from "@/lib/lecturas/leer";
import { HERRAMIENTA_DE_LA_LECTURA } from "@/lib/sessions/lectura-salida";

const DIA = 86_400_000;
const NOTAS =
  "Resumen\nRevisión de la integración con el ERP y la carga de datos comerciales.\n\nPróximos pasos\n" +
  "[Ana] Enviar la base de clientes: mandar el archivo con los clientes activos el miércoles.\n".repeat(6);

function respuesta(): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [
      {
        type: "tool_use",
        id: "tu_1",
        name: HERRAMIENTA_DE_LA_LECTURA,
        input: { minuta: { summary: "Se revisó la integración con el ERP.", agreements: [], decisions: [], risks: [], topics: [] }, compromisos: [], detectedTopics: ["erp"] },
      },
    ],
    usage: { input_tokens: 2_000, output_tokens: 500 },
  } as unknown as Anthropic.Messages.Message;
}

async function sembrar() {
  await prisma.sessionCategory.create({ data: { name: "Smarteam (test)", slug: "smarteam-test", kind: "internal", domains: ["smarteam.test"] } });
  await prisma.agent.create({ data: { id: "agent-post-session", name: "Análisis post-sesión", systemPrompt: "Lee la reunión.", associatedStages: [] } });
  const cliente = await prisma.client.create({ data: { name: "Cliente Notas (test)", kind: "PROSPECTO" } });
  await prisma.firefliesSession.create({
    data: {
      id: "notas-1",
      title: "Revisión ERP",
      date: new Date(Date.now() - 3 * DIA),
      enrichedAt: new Date(Date.now() - 3 * DIA),
      participants: ["ana@cliente.test", "liz@smarteam.test"],
      organizerEmail: "liz@smarteam.test",
      summary: { overview: NOTAS },
      resolvedClientId: cliente.id,
    },
  });
  return cliente;
}

describe("T2 · la lectura de una reunión con solo notas", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    crear.mockReset();
  });

  it("las notas van a la IA como el texto de la reunión, una vez y con su aviso, y dejan la minuta", async () => {
    vi.stubEnv("SEGUIMIENTO_SOLO_NOTAS", "");
    vi.stubEnv("SEGUIMIENTO_HECHOS", "");
    await sembrar();
    crear.mockResolvedValue(respuesta());

    const r = await leerAhora("notas-1", { pedidaPorEmail: "liz@smarteam.test" });
    expect(r.status).toBe("ok");
    expect(crear).toHaveBeenCalledTimes(1);
    const pedido = crear.mock.calls[0][0] as { messages: { content: string }[]; system: unknown };
    const mensaje = pedido.messages[0].content;
    expect(mensaje).toContain("=== NOTAS DE GEMINI (no hay transcripción de esta reunión) ===");
    expect(mensaje).toContain("no son palabras textuales de nadie");
    expect(mensaje).toContain("[Ana] Enviar la base de clientes");
    expect(mensaje.split("[Ana] Enviar la base de clientes: mandar").length - 1, "las notas van una sola vez (no también como resumen)").toBe(6);
    expect(mensaje).not.toContain("=== TRANSCRIPT ===");
    expect(mensaje).not.toContain("=== RESUMEN GENERADO POR GEMINI NOTES ===");

    const minuta = await prisma.sessionMinute.findUniqueOrThrow({ where: { sessionId: "notas-1" } });
    expect(minuta.summary).toBe("Se revisó la integración con el ERP.");
    const corrida = await prisma.agentRun.findFirstOrThrow({ where: { sourceSessionIds: { has: "notas-1" }, status: "DONE" } });
    expect(JSON.parse(corrida.output ?? "{}")).toMatchObject({ fuente: "notas" });
  });

  it("con SEGUIMIENTO_SOLO_NOTAS=0 (la vuelta atrás) no se llama a la IA ni queda minuta", async () => {
    vi.stubEnv("SEGUIMIENTO_SOLO_NOTAS", "0");
    vi.stubEnv("SEGUIMIENTO_HECHOS", "");
    await sembrar();
    const r = await leerAhora("notas-1", { pedidaPorEmail: "liz@smarteam.test" });
    expect(r.status).toBe("sin_texto");
    expect(crear).not.toHaveBeenCalled();
    expect(await prisma.sessionMinute.count({ where: { sessionId: "notas-1" } })).toBe(0);
  });
});
