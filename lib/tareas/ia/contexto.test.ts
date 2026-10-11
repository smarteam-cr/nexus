import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { HERRAMIENTA_DEL_CONTEXTO, LINEAS_POR_LLAMADA, leerContextos, maxTokensDelContexto, pedidoDeContextos } from "./contexto";

const respuesta = (input: unknown, stop: Anthropic.Messages.Message["stop_reason"] = "tool_use") => ({
  stop_reason: stop,
  content: [{ type: "tool_use" as const, id: "x", name: HERRAMIENTA_DEL_CONTEXTO, input }] as Anthropic.Messages.Message["content"],
});

describe("el contexto de las propuestas de una reunión", () => {
  it("el pedido fuerza la herramienta, cierra las claves y manda el resumen, los detalles y las líneas", () => {
    const p = pedidoDeContextos({
      titulo: "Sprint planning de marketing",
      fecha: "lun 5 oct",
      resumen: "Se revisó la campaña de SAP.",
      detalles: ["**Banner de SAP:** Lidia comentó que el banner tiene que estar para la campaña de octubre."],
      lineas: [{ ref: "L1", titulo: "Diseñar el banner de SAP", texto: "[Lidia Flores] Banner: diseñar el banner de SAP" }],
    });
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DEL_CONTEXTO });
    expect(p.max_tokens).toBe(maxTokensDelContexto(1));
    const contenido = String(p.messages[0].content);
    expect(contenido).toContain("RESUMEN");
    expect(contenido).toContain("DETALLES");
    expect(contenido).toContain("L1 «Diseñar el banner de SAP»");
    const items = ((p.tools![0] as Anthropic.Messages.Tool).input_schema.properties as Record<string, { items: { properties: { L: { enum: string[] } } } }>).contextos.items;
    expect(items.properties.L.enum).toEqual(["L1"]);
  });

  it("entra solo lo válido: una clave conocida, sin voseo, que no repita el título", () => {
    const titulos = new Map([
      ["L1", "Diseñar el banner de SAP"],
      ["L2", "Mandar el reporte"],
      ["L3", "Llamar a Fabio"],
    ]);
    const leidos = leerContextos(
      respuesta({
        contextos: [
          { L: "L1", contexto: "Es para la campaña de SAP de octubre, con el logo nuevo." },
          { L: "L2", contexto: "Avisame cuando esté listo." },
          { L: "L3", contexto: "Llamar a Fabio" },
          { L: "L9", contexto: "Algo de otra línea." },
        ],
      }),
      titulos,
    );
    expect([...leidos.entries()]).toEqual([["L1", "Es para la campaña de SAP de octubre, con el logo nuevo."]]);
    // Cortada: no se usa nada.
    expect(leerContextos(respuesta({ contextos: [{ L: "L1", contexto: "Algo." }] }, "max_tokens"), titulos).size).toBe(0);
  });

  it("el presupuesto de una tanda alcanza para contextos de 400 caracteres en todas sus líneas", () => {
    // ~3,2 caracteres por token, más la clave y el JSON de cada ítem.
    expect(maxTokensDelContexto(LINEAS_POR_LLAMADA)).toBeGreaterThanOrEqual(LINEAS_POR_LLAMADA * Math.ceil(400 / 3.2 + 15));
  });
});
