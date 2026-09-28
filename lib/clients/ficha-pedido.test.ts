import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { leerRespuesta, pedidoDeFicha, sinGenteDeSmarteam } from "./ficha-pedido";
import { fichaVacia } from "./ficha";

const EQUIPO = ["Lorena Osorio", "Heiver Gomez", "Andrés Pinzón"];

describe("sinGenteDeSmarteam", () => {
  it("⛔ saca al equipo de Smarteam de los stakeholders, con o sin tildes y negritas", () => {
    const v = [
      "- **Catalina Araya** — CS — líder — participativa",
      "- **Lorena Osorio** — operaciones — enlace — operativa",
      "- Heiver Gómez — técnico",
      "- **Andres Pinzon** — ventas",
    ].join("\n");
    expect(sinGenteDeSmarteam(v, EQUIPO)).toBe("- **Catalina Araya** — CS — líder — participativa");
  });

  it("un homónimo a medias (solo el nombre) no se borra", () => {
    expect(sinGenteDeSmarteam("- Lorena Vargas — gerente", EQUIPO)).toBe("- Lorena Vargas — gerente");
  });

  it("sin equipo no toca nada", () => {
    expect(sinGenteDeSmarteam("- Lorena Osorio — x", [])).toBe("- Lorena Osorio — x");
  });
});

describe("leerRespuesta", () => {
  const fuentes = [
    { id: "S1", etiqueta: "Sesión «A»", texto: "..." },
    { id: "H1", etiqueta: "Handoff", texto: "..." },
  ];
  const respuesta = (campos: unknown) =>
    ({ content: [{ type: "tool_use", name: "proponer_cambios", id: "x", input: { campos } }] }) as unknown as Anthropic.Messages.Message;

  it("traduce los ids a etiquetas y filtra el equipo en stakeholders", () => {
    const r = leerRespuesta(
      respuesta([
        { clave: "stakeholders", valor: "- Ana Mora — CEO\n- Lorena Osorio — enlace", fuentes: ["S1"] },
        { clave: "dolorPrincipal", valor: "- x", fuentes: ["Z9"] },
      ]),
      fuentes,
      EQUIPO,
    );
    expect(r[0]).toEqual({ clave: "stakeholders", valor: "- Ana Mora — CEO", fuentes: ["Sesión «A»"] });
    // Un id inventado no se muestra: se atribuye a todas las fuentes de la corrida.
    expect(r[1].fuentes).toEqual(["Sesión «A»", "Handoff"]);
  });

  it("sin la herramienta, nada", () => {
    expect(leerRespuesta({ content: [{ type: "text", text: "hola" }] } as unknown as Anthropic.Messages.Message, fuentes)).toEqual([]);
  });
});

describe("pedidoDeFicha", () => {
  it("le dice al modelo quién es de Smarteam y lleva la ficha actual", () => {
    const p = pedidoDeFicha({
      cliente: { name: "Wherex", industry: null },
      ficha: fichaVacia(),
      fuentes: [{ id: "S1", etiqueta: "Sesión «A»", texto: "hola" }],
      modelo: "m",
      equipoSmarteam: EQUIPO,
    });
    const cuerpo = (p.messages[0].content as string);
    expect(cuerpo).toContain("EQUIPO DE SMARTEAM (NO son stakeholders del cliente)");
    expect(cuerpo).toContain("Lorena Osorio");
    expect(cuerpo).toContain("=== FICHA ACTUAL ===");
    expect(p.tool_choice).toEqual({ type: "tool", name: "proponer_cambios" });
    expect(String(p.system)).toContain("ESTRATÉGICA");
  });
});
