import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { aplicarElArreglo, HERRAMIENTA_DEL_ARREGLO, leerElArreglo, MAX_TEXTOS_A_ARREGLAR, pedidoDelArreglo, textosAArreglar } from "./arreglo-de-la-guia";
import { HERRAMIENTA_DE_LA_GUIA } from "./guia-pedido";

const mensaje = (name: string, input: unknown): Anthropic.Messages.Message =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "x",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [{ type: "tool_use", id: "t", name, input }],
  }) as unknown as Anthropic.Messages.Message;

const guia = mensaje(HERRAMIENTA_DE_LA_GUIA, {
  bloques: [
    {
      titulo: "Cómo llegan los clientes",
      abre: "¿Tienen un proceso para calificar los leads?",
      guia: "Si contás con tiempo, profundizá en el seguimiento.",
      profundizar: ["Cuéntame cómo deciden a quién llamar primero.", "¿De dónde vienen los clientes, y cuántos llegan por mes?"],
      averiguar: [{ para: "leads", que: "Cómo califican", preguntas: ["Cuéntame qué pasa con un lead nuevo."] }],
    },
  ],
});

describe("el arreglo puntual de la guía", () => {
  it("junta solo los textos con problema, tal como salieron", () => {
    // La doble llega partida, como la deja la lectura de la agenda: la mitad cerrada encuentra su texto entero.
    const textos = textosAArreglar(guia, ["¿Tienen un proceso para calificar los leads?", "¿Cuántos llegan por mes?"], ["contás", "profundizá"]);
    expect(textos).toEqual([
      "¿Tienen un proceso para calificar los leads?",
      "Si contás con tiempo, profundizá en el seguimiento.",
      "¿De dónde vienen los clientes, y cuántos llegan por mes?",
    ]);
  });

  it("no toca lo que no es la guía ni los identificadores", () => {
    const conExtras = mensaje(HERRAMIENTA_DE_LA_GUIA, {
      bloques: [{ abre: "¿Tienen CRM hoy?", averiguar: [{ para: "¿Tienen CRM hoy?", que: "x", preguntas: [] }] }],
      faltaContexto: [{ pregunta: "¿Tienen CRM hoy?", opciones: ["Sí", "No"] }],
    });
    expect(textosAArreglar(conExtras, ["¿Tienen CRM hoy?"], [])).toEqual(["¿Tienen CRM hoy?"]);
    const nueva = aplicarElArreglo(conExtras, new Map([["¿Tienen CRM hoy?", "Cuéntame qué usan hoy."]]));
    const input = (nueva.content[0] as Anthropic.Messages.ToolUseBlock).input as { bloques: { abre: string; averiguar: { para: string }[] }[]; faltaContexto: { pregunta: string }[] };
    expect(input.bloques[0].abre).toBe("Cuéntame qué usan hoy.");
    expect(input.bloques[0].averiguar[0].para).toBe("¿Tienen CRM hoy?");
    expect(input.faltaContexto[0].pregunta).toBe("¿Tienen CRM hoy?");
  });

  it("sin problemas no hay nada que arreglar", () => {
    expect(textosAArreglar(guia, [], [])).toEqual([]);
  });

  it("encuentra el texto aunque la lectura le haya cambiado el espacio por completar", () => {
    const conHueco = mensaje(HERRAMIENTA_DE_LA_GUIA, { bloques: [{ abre: "Resume los retos de [cliente] con sus palabras." }] });
    expect(textosAArreglar(conHueco, ["Resume los retos de (cliente) con sus palabras."], [])).toEqual(["Resume los retos de [cliente] con sus palabras."]);
  });

  it("no pasa del tope", () => {
    const muchas = mensaje(HERRAMIENTA_DE_LA_GUIA, { bloques: Array.from({ length: 50 }, (_, i) => ({ abre: `¿Tienen la cosa número ${i} lista para hoy?` })) });
    const malos = Array.from({ length: 50 }, (_, i) => `¿Tienen la cosa número ${i} lista para hoy?`);
    expect(textosAArreglar(muchas, malos, [])).toHaveLength(MAX_TEXTOS_A_ARREGLAR);
  });

  it("el pedido es chico: los textos numerados, sin contexto del cliente", () => {
    const p = pedidoDelArreglo(["uno", "dos"]);
    expect(p.messages).toEqual([{ role: "user", content: "1. uno\n2. dos" }]);
    expect(p.max_tokens).toBeLessThanOrEqual(3000);
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DEL_ARREGLO });
  });

  it("lee la respuesta por número e ignora lo que no existe o viene vacío", () => {
    const textos = ["a", "b"];
    const r = mensaje(HERRAMIENTA_DEL_ARREGLO, { textos: [{ n: 1, texto: " A nueva " }, { n: 2, texto: "  " }, { n: 9, texto: "fuera" }, { n: "1", texto: "x" }] });
    expect([...leerElArreglo(r, textos)]).toEqual([["a", "A nueva"]]);
    expect(leerElArreglo(mensaje("otra", {}), textos).size).toBe(0);
  });

  it("aplica los cambios en la misma respuesta, sin tocar el resto", () => {
    const cambios = new Map([["¿Tienen un proceso para calificar los leads?", "Cuéntame cómo califican los leads hoy."]]);
    const nueva = aplicarElArreglo(guia, cambios);
    const input = (nueva.content[0] as Anthropic.Messages.ToolUseBlock).input as { bloques: { abre: string; titulo: string }[] };
    expect(input.bloques[0].abre).toBe("Cuéntame cómo califican los leads hoy.");
    expect(input.bloques[0].titulo).toBe("Cómo llegan los clientes");
    // La original no cambia, y sin cambios vuelve la misma.
    expect(((guia.content[0] as Anthropic.Messages.ToolUseBlock).input as { bloques: { abre: string }[] }).bloques[0].abre).toBe("¿Tienen un proceso para calificar los leads?");
    expect(aplicarElArreglo(guia, new Map())).toBe(guia);
  });

  it("el armado de la guía ya no la pide entera otra vez (escaneo de agente.ts)", () => {
    const agente = readFileSync(join(__dirname, "agente.ts"), "utf8");
    expect(agente).toMatch(/pedidoDelArreglo\(textos\)/);
    expect(agente).not.toMatch(/pedir\(aviso\)/);
    expect(agente).toMatch(/origen: "exploraciones\/agente:guia-arreglo"/);
  });
});
