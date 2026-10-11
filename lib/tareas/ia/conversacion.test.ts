import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { huellaDeTexto } from "../texto";
import { HERRAMIENTA_DE_LA_CONVERSACION, leerSalidaDeConversacion, pedidoDeConversacion, tituloConVoseo } from "./conversacion";

const refs = { M: new Set(["M1", "M2"]), T: new Set(["T1"]), R: new Set(["R1"]), turnos: 40, yaSalieron: new Set([huellaDeTexto("Revisar los copies del Radisson")]) };

function respuesta(input: unknown, stop: Anthropic.Messages.Message["stop_reason"] = "tool_use"): Pick<Anthropic.Messages.Message, "content" | "stop_reason"> {
  return { stop_reason: stop, content: [{ type: "tool_use", id: "x", name: HERRAMIENTA_DE_LA_CONVERSACION, input } as Anthropic.Messages.ToolUseBlock] };
}

describe("pedidoDeConversacion", () => {
  it("fuerza la herramienta, cierra las listas y dice si la conversación no entró entera", () => {
    const p = pedidoDeConversacion({
      titulo: "Sprint planning",
      fecha: "lun 5 oct",
      conversacion: "[1] Ana: yo mando el banner el jueves",
      turnos: 1,
      recortada: true,
      personas: [{ ref: "M1", nombre: "Ana Pérez", equipo: "Marketing" }],
      candidatas: [],
      proyectos: [],
      yaSalieron: ["Revisar los copies"],
    });
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_LA_CONVERSACION });
    expect(p.max_tokens).toBe(4_500);
    expect(((p.tools![0] as Anthropic.Messages.Tool).input_schema.properties as Record<string, { items: { required: string[] } }>).tareas.items.required).toContain("contexto");
    const contenido = String(p.messages[0].content);
    expect(contenido).toContain("no entró entera");
    expect(contenido).toContain("YA SALIERON");
    const schema = p.tools![0] as Anthropic.Messages.Tool;
    const tarea = (schema.input_schema.properties as Record<string, { items: { properties: Record<string, unknown> } }>).tareas.items.properties;
    expect(tarea.dueno).toEqual({ type: ["string", "null"], enum: ["M1", null] });
    expect(tarea.misma).toEqual({ type: "null" });
  });
});

describe("leerSalidaDeConversacion", () => {
  it("valida cada id, descarta un turno de afuera, lo repetido y lo que ya salió de las notas", () => {
    const s = leerSalidaDeConversacion(
      respuesta({
        tareas: [
          { titulo: "Enviar el Excel de leads a Fabio", dueno: "M1", turno: 12, misma: "T9", vence: "jueves" },
          { titulo: "Enviar el excel de leads a Fabio", dueno: "M2", turno: 13 },
          { titulo: "Revisar los copies del Radisson", dueno: "M1", turno: 3 },
          { titulo: "Armar el reporte", dueno: "M7", turno: 99 },
          { titulo: "Subir el banner", dueno: "M7", turno: 5, proyecto: "R1" },
        ],
      }),
      refs,
    );
    expect(s?.tareas).toEqual([
      { titulo: "Enviar el Excel de leads a Fabio", revisarTitulo: false, contexto: null, dueno: "M1", turno: 12, misma: null, proyecto: null, grupo: null, vence: "jueves" },
      { titulo: "Subir el banner", revisarTitulo: false, contexto: null, dueno: null, turno: 5, misma: null, proyecto: "R1", grupo: null, vence: null },
    ]);
  });

  it("recorta un título largo y marca el voseo para revisar, sin descartarlo", () => {
    const largo = "Preparar la presentación completa del diagnóstico de marketing para el cliente";
    const s = leerSalidaDeConversacion(respuesta({ tareas: [{ titulo: largo, turno: 1 }, { titulo: "Mandá el reporte a Lidia", turno: 2 }] }), refs);
    expect(s?.tareas[0].titulo.length).toBeLessThanOrEqual(60);
    expect(s?.tareas[0].revisarTitulo).toBe(true);
    expect(s?.tareas[1].revisarTitulo).toBe(true);
  });

  it("una respuesta cortada no se usa", () => {
    expect(leerSalidaDeConversacion(respuesta({ tareas: [{ titulo: "Enviar", turno: 1 }] }, "max_tokens"), refs)).toBeNull();
  });

  it("un grupo sin tareas o sin declarar no queda; un nombre que no calza usa el primer título", () => {
    const s = leerSalidaDeConversacion(
      respuesta({
        tareas: [
          { titulo: "Diseñar el banner de la campaña SAP", turno: 1, grupo: "G1" },
          { titulo: "Escribir los copies de la campaña SAP", turno: 2, grupo: "G1" },
          { titulo: "Llamar a la imprenta", turno: 3, grupo: "G2" },
        ],
        grupos: [{ G: "G1", nombre: "Lanzamiento de algo distinto" }],
      }),
      refs,
    );
    expect(s?.grupos).toEqual([{ G: "G1", nombre: "Diseñar el banner de la campaña SAP", mismoQue: null }]);
    expect(s?.tareas[2].grupo).toBeNull();
  });
});

describe("tituloConVoseo", () => {
  it("caza el imperativo de voseo y no un título en infinitivo", () => {
    expect(tituloConVoseo("Revisá los copies")).toBe(true);
    expect(tituloConVoseo("Revisar los copies")).toBe(false);
    expect(tituloConVoseo("Está pendiente el banner")).toBe(false);
  });
});

describe("el contexto de cada compromiso (2026-10-09)", () => {
  it("entra el que sirve; el que viene en voseo o repite el título queda en null (lo arma el código)", () => {
    const s = leerSalidaDeConversacion(
      respuesta({
        tareas: [
          { titulo: "Enviar el Excel de leads a Fabio", contexto: "Fabio lo necesita para cruzar los leads de octubre con su CRM.", dueno: "M1", turno: 12 },
          { titulo: "Subir el banner", contexto: "Avisame cuando esté aprobado, así lo publicamos.", dueno: "M1", turno: 5 },
          { titulo: "Armar el reporte", contexto: "Armar el reporte", dueno: "M1", turno: 6 },
        ],
      }),
      refs,
    );
    expect(s?.tareas.map((t) => t.contexto)).toEqual(["Fabio lo necesita para cruzar los leads de octubre con su CRM.", null, null]);
  });
});
