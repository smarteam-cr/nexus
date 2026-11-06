import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { alternarAveriguada, avanceDeLaAgenda, estaAveriguada, idDeAveriguar, preguntaCerrada, preguntaDoble, preguntasQueNoCumplen, type AgendaDeLaGuia } from "./agenda";
import { HERRAMIENTA_DE_LA_GUIA, leerLaGuiaDelAgente, pedidoDeLaGuia, voseoEnLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
import { leerGuia } from "./esquemas";

function ctx(cambios: Partial<ContextoDeLaGuia> = {}): ContextoDeLaGuia {
  return {
    empresa: "Grupo Prueba",
    industria: "Retail",
    edicion: "general",
    perfil: null,
    hoy: "2026-11-06",
    proxima: { numero: 2, titulo: null, fecha: null, sesionId: "s-a1" },
    conTest: false,
    desdeCero: false,
    nivelesDeLaEscala: [],
    paraConectar: null,
    hubspotActual: null,
    confirmado: [],
    huecos: [{ clave: "metas", etiqueta: "Metas", ayuda: "", base: "" }],
    enfoque: [],
    noExplorado: [],
    objecionesDichas: [],
    paraExplorar: [],
    ...cambios,
  };
}

/** Lo que devolvería el agente, como bloque de la herramienta. */
function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return { content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_LA_GUIA, input }] } as unknown as Anthropic.Messages.Message;
}

const BLOQUE = (titulo: string, desde: number, hasta: number, extra: Record<string, unknown> = {}) => ({ titulo, desde, hasta, tipo: "cuerpo", abre: `Cuéntame de ${titulo}`, averiguar: [], ...extra });

describe("la agenda: preguntas abiertas y de una sola cosa (punto 11)", () => {
  it("marca las que se responden con sí, no o un número", () => {
    expect(preguntaCerrada("¿Tienen reglas para asignar los interesados?")).toBe(true);
    expect(preguntaCerrada("¿Cuántos vendedores tienen?")).toBe(true);
    expect(preguntaCerrada("Cuéntame cómo se decide hoy a qué vendedor le toca cada interesado")).toBe(false);
    expect(preguntaCerrada("¿Cómo deciden cuántos interesados le tocan a cada uno?")).toBe(false);
  });

  it("marca las que preguntan dos cosas", () => {
    expect(preguntaDoble("¿Cómo llegan? ¿Y quién los atiende?")).toBe(true);
    expect(preguntaDoble("¿Cómo llegan los interesados?")).toBe(false);
  });
});

describe("las marcas de lo averiguado (punto 8)", () => {
  const nueva = { id: idDeAveriguar("Cómo se asignan los interesados"), para: "1.2" };
  const sabida = { id: idDeAveriguar("Qué venden"), sabido: "el traspaso" };

  it("la huella no cambia con mayúsculas ni espacios", () => {
    expect(idDeAveriguar("Cómo se asignan  los interesados ")).toBe(nueva.id);
  });

  it("marcar una nueva deja también su tema como preguntado; lo que ya se sabía nace marcado y se puede desmarcar", () => {
    const h = alternarAveriguada(nueva, []);
    expect(estaAveriguada(nueva, h)).toBe(true);
    expect(h).toContain("1.2");
    expect(estaAveriguada(sabida, [])).toBe(true);
    const sin = alternarAveriguada(sabida, []);
    expect(estaAveriguada(sabida, sin)).toBe(false);
    expect(estaAveriguada(sabida, alternarAveriguada(sabida, sin))).toBe(true);
  });
});

describe("leer la agenda que devuelve el agente", () => {
  const input = {
    objetivo: "Entender cómo llegan y se atienden los interesados.",
    claves: ["Sus retos", "Cómo los mide hoy", "A dónde quiere llegar", "Quién decide", "De más"],
    bloques: [
      { titulo: "Abrir", desde: 0, hasta: 5, tipo: "cuerpo", abre: "Hola, gracias por el tiempo.", averiguar: [] },
      BLOQUE("Cómo llegan", 5, 15, {
        averiguar: [
          { que: "Cómo llega el interesado", preguntas: ["Cuéntame por dónde llega un interesado nuevo"], para: "metas" },
          { que: "Cómo se asignan", preguntas: ["Cuéntame cómo se decide a quién le toca"], para: "no-existe" },
          { que: "Cómo llega el interesado", preguntas: ["repetida"] },
        ],
      }),
      BLOQUE("El seguimiento", 15, 40, { central: true, impacto: "Cuántos se enfrían por mes y cuánto vale cada uno." }),
      BLOQUE("Lo que no compran", 40, 50, { central: true }),
      { titulo: "Cerrar", desde: 50, hasta: 60, tipo: "cuerpo", abre: "Entonces lo que más les pesa es…; ¿lo entendí bien?", averiguar: [] },
    ],
  };

  it("la apertura y el cierre son el primero y el último, hay un solo central y lo repetido o ajeno se cae", () => {
    const g = leerLaGuiaDelAgente(respuesta(input), ctx(), "r1", new Date("2026-11-06T12:00:00Z"));
    const a = g!.agenda!;
    expect(a.bloques.map((b) => b.tipo)).toEqual(["apertura", "cuerpo", "cuerpo", "cuerpo", "cierre"]);
    expect(a.bloques.filter((b) => b.central).map((b) => b.titulo)).toEqual(["El seguimiento"]);
    expect(a.claves).toHaveLength(4);
    expect(a.bloques[1].averiguar.map((c) => c.que)).toEqual(["Cómo llega el interesado", "Cómo se asignan"]);
    expect(a.bloques[1].averiguar[1].para).toBeUndefined();
    // Las preguntas de antes salen de la agenda, para lo que todavía las lee.
    expect(g!.preguntas.map((p) => p.para)).toEqual(["metas"]);
    expect(g!.cierre).toContain("lo entendí bien");
  });

  it("la guía guardada se vuelve a leer igual, y una de antes (sin agenda) también", () => {
    const g = leerLaGuiaDelAgente(respuesta(input), ctx(), "r1")!;
    const guardada = JSON.parse(JSON.stringify(g));
    expect(leerGuia(guardada)?.agenda?.bloques).toHaveLength(5);
    const { agenda: _a, ...deAntes } = guardada;
    void _a;
    expect(leerGuia(deAntes)?.agenda).toBeUndefined();
    expect(leerGuia(deAntes)?.preguntas).toHaveLength(1);
  });

  it("el voseo y las preguntas cerradas de la agenda se detectan para pedirla otra vez", () => {
    const agenda: AgendaDeLaGuia = {
      claves: ["x"],
      bloques: [
        { desde: 0, hasta: 5, titulo: "Abrir", tipo: "apertura", abre: "Hola", averiguar: [] },
        { desde: 5, hasta: 55, titulo: "Cuerpo", tipo: "cuerpo", abre: "¿Tienen un CRM?", averiguar: [{ id: "av:1", que: "x", preguntas: ["Contame cómo lo hacés"] }] },
        { desde: 55, hasta: 60, titulo: "Cerrar", tipo: "cierre", abre: "Gracias", averiguar: [] },
      ],
    };
    expect(preguntasQueNoCumplen(agenda)).toEqual(["¿Tienen un CRM?"]);
    const g = leerLaGuiaDelAgente(respuesta({ objetivo: "x", claves: ["x"], bloques: agenda.bloques }), ctx(), null)!;
    expect(voseoEnLaGuia(g).length).toBeGreaterThan(0);
    expect(avanceDeLaAgenda(agenda, ["av:1"])).toEqual({ sabidas: 1, total: 1 });
  });
});

describe("el pedido de la agenda", () => {
  it("lleva el contexto que dio la persona, la duración y, en preventa, los clientes de referencia", () => {
    const p = pedidoDeLaGuia(
      ctx({
        duracion: 45,
        contextoDeLaExploracion: { objetivo: "Ver si les sirve ordenar el seguimiento", sabemos: "Llegaron por un referido" },
        contextoDeLaSesion: { conQuien: "Ana Pérez, gerente general", espera: "Quieren ver un demo y precios", objetivo: null },
        referencias: ["Retail: Tienda Ejemplo"],
      }),
    );
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("Ver si les sirve ordenar el seguimiento");
    expect(cuerpo).toContain("Ana Pérez, gerente general");
    expect(cuerpo).toContain("Duración: 45 minutos.");
    expect(cuerpo).toContain("Retail: Tienda Ejemplo");
    expect(String(p.system)).toContain("fraseDeDemo");
  });

  it("en un proyecto no lleva clientes de referencia ni la frase del demo", () => {
    const p = pedidoDeLaGuia(ctx({ marco: "cs" }));
    expect(String(p.messages[0].content)).not.toContain("CLIENTES DE REFERENCIA");
    expect(JSON.stringify(p.tools)).not.toContain("fraseDeDemo");
  });
});
