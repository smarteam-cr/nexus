import { describe, expect, it } from "vitest";
import { fechaDelCorreo, HERRAMIENTA_DE_COMPROMISOS, leerCompromisosDelCorreo, pedidoDeCompromisos } from "./compromisos";

const correo = {
  empresa: "Distribuidora Larce",
  autor: "Marco Salas",
  ocurrioAt: new Date("2026-10-16T16:00:00.000Z"),
  asunto: "Minuta de la sesión 1",
  texto: "Hola Ana, gracias por la sesión. Quedamos en agendar la sesión 2 para el martes 21 de octubre a las 10:00. Tú nos envías la base de contactos el lunes.",
};

const respuesta = (compromisos: unknown[], stop: "end_turn" | "max_tokens" = "end_turn") =>
  ({ stop_reason: stop, content: [{ type: "tool_use", id: "t", name: HERRAMIENTA_DE_COMPROMISOS, input: { compromisos } }] }) as unknown as Parameters<typeof leerCompromisosDelCorreo>[0];

describe("los compromisos de un correo", () => {
  it("la fecha del correo, en hora de Costa Rica", () => {
    expect(fechaDelCorreo(correo.ocurrioAt)).toEqual({ iso: "2026-10-16", legible: "viernes 16 de octubre de 2026" });
  });

  it("el pedido usa el mismo esquema que una reunión, con la herramienta forzada", () => {
    const p = pedidoDeCompromisos(correo, ["marco@smarteamcr.com"]);
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_COMPROMISOS });
    expect(p.temperature).toBe(0);
    expect(JSON.stringify(p.tools)).toContain("marco@smarteamcr.com");
    expect(JSON.stringify(p.messages)).toContain("Distribuidora Larce");
  });

  it("solo entra lo que trae una cita tal cual del correo", () => {
    const r = leerCompromisosDelCorreo(
      respuesta([
        { quien: "SMARTEAM", que: "Agendar la sesión 2", fecha: "2026-10-21", tipo: "PLAN", frenaElPlan: false, cita: "agendar la sesión 2 para el martes 21 de octubre" },
        { quien: "CLIENTE", responsable: "Ana", que: "Enviar la base de contactos", tituloDeSeguimiento: "Recordarle a Ana que envíe la base", fecha: "2026-10-20", tipo: "INSUMO", frenaElPlan: true, cita: "nos envías la base de contactos el lunes" },
        { quien: "SMARTEAM", que: "Mandar la propuesta", fecha: null, tipo: "ACCION", frenaElPlan: false, cita: "te mando la propuesta mañana" },
      ]),
      correo,
    )!;
    expect(r.compromisos.map((c) => c.que)).toEqual(["Agendar la sesión 2", "Enviar la base de contactos"]);
    expect(r.descartadosPorCita).toBe(1);
  });

  it("una respuesta cortada o sin la herramienta no sirve (se reintenta)", () => {
    expect(leerCompromisosDelCorreo(respuesta([], "max_tokens"), correo)).toBeNull();
    expect(leerCompromisosDelCorreo({ stop_reason: "end_turn", content: [{ type: "text", text: "nada" }] } as never, correo)).toBeNull();
  });
});
