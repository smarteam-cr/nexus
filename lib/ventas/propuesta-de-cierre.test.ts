import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { leerPropuestaDeCierre, pedidoDeCierre, type FuenteDeCierre } from "./propuesta-de-cierre";

const FUENTES: FuenteDeCierre[] = [
  { rotulo: "Reunión «Revisión de la propuesta» del 12 oct", texto: "Carlos dijo: la gerencia firma antes de fin de noviembre. El presupuesto aprobado es de 10.500 dólares." },
  { rotulo: "Siguiente paso en HubSpot", texto: "Enviar la propuesta con los costos de DocuSign." },
];
const CTX = { fuentes: FUENTES, hoyISO: "2026-10-14", moneda: "USD", falta: { fecha: true, monto: true }, ahora: new Date("2026-10-14T16:00:00Z") };

const respuesta = (input: unknown): Pick<Anthropic.Messages.Message, "content"> => ({
  content: [{ type: "tool_use", id: "t", name: "registrar_cierre", input } as Anthropic.Messages.ToolUseBlock],
});

describe("la propuesta de fecha de cierre y monto", () => {
  it("deja lo que se sostiene con una cita copiada de la fuente", () => {
    const p = leerPropuestaDeCierre(
      respuesta({
        fechaCierre: { valor: "2026-11-30", cita: "la gerencia firma antes de fin de noviembre", fuente: "Reunión «Revisión de la propuesta» del 12 oct" },
        monto: { valor: 10500, moneda: "usd", cita: "El presupuesto aprobado es de 10.500 dólares", fuente: "[F1] Reunión «Revisión de la propuesta» del 12 oct" },
      }),
      CTX,
    );
    expect(p.fechaCierre).toEqual({ valor: "2026-11-30", cita: "la gerencia firma antes de fin de noviembre", fuente: "Reunión «Revisión de la propuesta» del 12 oct" });
    expect(p.monto?.valor).toBe(10500);
    expect(p.monto?.fuente).toBe("Reunión «Revisión de la propuesta» del 12 oct");
  });

  it("descarta una cita que no está en ninguna fuente", () => {
    const p = leerPropuestaDeCierre(respuesta({ fechaCierre: { valor: "2026-11-30", cita: "cerramos a fin de mes seguro", fuente: "x" } }), CTX);
    expect(p.fechaCierre).toBeUndefined();
  });

  it("descarta una fecha que ya pasó y un monto en otra moneda", () => {
    const p = leerPropuestaDeCierre(
      respuesta({
        fechaCierre: { valor: "2026-09-30", cita: "la gerencia firma antes de fin de noviembre", fuente: "x" },
        monto: { valor: 10500, moneda: "CRC", cita: "El presupuesto aprobado es de 10.500 dólares", fuente: "x" },
      }),
      CTX,
    );
    expect(p).toEqual({ calculadaAt: CTX.ahora.toISOString() });
  });

  it("no propone lo que al negocio no le falta", () => {
    const p = leerPropuestaDeCierre(
      respuesta({ fechaCierre: { valor: "2026-11-30", cita: "la gerencia firma antes de fin de noviembre", fuente: "x" } }),
      { ...CTX, falta: { fecha: false, monto: true } },
    );
    expect(p.fechaCierre).toBeUndefined();
  });

  it("el pedido nombra lo que falta y numera las fuentes", () => {
    const pedido = pedidoDeCierre({ negocio: "CasaMax", empresa: "CasaMax", etapa: "Pricing", moneda: "USD", falta: { fecha: true, monto: false }, hoyISO: "2026-10-14", fuentes: FUENTES });
    const texto = String(pedido.messages[0]!.content);
    expect(texto).toContain("Le falta la fecha de cierre.");
    expect(texto).toContain("[F2] Siguiente paso en HubSpot");
  });
});
