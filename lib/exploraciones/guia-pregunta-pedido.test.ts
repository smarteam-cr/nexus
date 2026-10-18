/**
 * lib/exploraciones/guia-pregunta-pedido.test.ts — «Regenerar» una pregunta de la guía (validación 69): el pedido y la
 * lectura. Correr: `npx vitest run lib/exploraciones/guia-pregunta-pedido.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { contextoDelPlan } from "./plan-de-la-guia";
import { avisoParaOtraVez, HERRAMIENTA_DE_UNA_PREGUNTA, leerUnaPregunta, pedidoDeUnaPregunta, type EntradaDeUnaPregunta } from "./guia-pregunta-pedido";

const { saber } = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });

const ENTRADA: EntradaDeUnaPregunta = {
  ctx: {
    empresa: "Distribuidora Ejemplo",
    industria: "Distribución",
    marco: "venta",
    loQueYaSabemos: ["Seguimiento: «Cuando un deal se enfría, el vendedor lo deja morir» (Nota del 14 oct)"],
    confirmado: [],
    paraConectar: null,
    instrucciones: "",
  },
  objetivo: {
    para: "1.7",
    nombre: "Seguimiento",
    paso: "impacto",
    motivo: { texto: "Cuando un deal se enfría, el vendedor lo deja morir", de: "Nota del 14 oct" },
    dimension: { pregunta: "¿Cómo dan seguimiento a los negocios?", nivel: "Inicial" },
    actual: "¿Cuántos negocios se les fueron así este año?",
    repreguntas: ["¿Y en plata?"],
  },
  otras: ["¿Para cuándo necesitan tenerlo resuelto?"],
};

function respuesta(input: unknown): Anthropic.Messages.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "x",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_UNA_PREGUNTA, input }],
  } as unknown as Anthropic.Messages.Message;
}

describe("el pedido de una pregunta", () => {
  const p = pedidoDeUnaPregunta(ENTRADA);
  const cuerpo = String((p.messages[0] as { content: string }).content);

  it("lleva el paso, lo que dijo el cliente, la de hoy y las otras de la guía", () => {
    expect(cuerpo).toContain("Paso: impacto");
    expect(cuerpo).toContain("Cuando un deal se enfría");
    expect(cuerpo).toContain("La de hoy (escribe OTRA): ¿Cuántos negocios se les fueron así este año?");
    expect(cuerpo).toContain("¿Para cuándo necesitan tenerlo resuelto?");
  });

  it("pide la pregunta sola, sin citar al cliente, en tuteo, con una sola herramienta", () => {
    expect(String(p.system)).toContain("SOLO la pregunta");
    expect(String(p.system)).toContain("tuteo");
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_UNA_PREGUNTA });
  });
});

describe("leer la pregunta nueva", () => {
  it("una buena: sin la cita adelante, con sus repreguntas", () => {
    const l = leerUnaPregunta(respuesta({ pregunta: "Dijiste que los deals se enfrían. ¿Cuántas horas por semana se van en retomarlos?", repreguntas: ["¿Quién lo hace?", "¿Y si no?"] }), ENTRADA, saber);
    expect(l).toEqual({ ok: true, pregunta: "¿Cuántas horas por semana se van en retomarlos?", repreguntas: ["¿Quién lo hace?", "¿Y si no?"] });
  });

  it("no sirve si es la misma de hoy, si repite lo que dijo, si viene vacía o en voseo", () => {
    expect(leerUnaPregunta(respuesta({ pregunta: "¿Cuántos negocios se les fueron así este año?", repreguntas: [] }), ENTRADA, saber)).toMatchObject({ ok: false, motivo: "igual" });
    expect(leerUnaPregunta(respuesta({ pregunta: "¿Qué pasa cuando un deal se queda quieto?", repreguntas: [] }), ENTRADA, saber)).toMatchObject({ ok: false, motivo: "repite" });
    expect(leerUnaPregunta(respuesta({ pregunta: "  ", repreguntas: [] }), ENTRADA, saber)).toMatchObject({ ok: false, motivo: "vacia" });
    const v = leerUnaPregunta(respuesta({ pregunta: "¿Cuánto podés perder si esto sigue igual?", repreguntas: [] }), ENTRADA, saber);
    expect(v).toMatchObject({ ok: false, motivo: "voseo" });
    if (!v.ok) expect(avisoParaOtraVez(v)).toContain("tuteo");
  });
});
