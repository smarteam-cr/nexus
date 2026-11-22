import { describe, expect, it } from "vitest";
import { contarHablarConNexus, type CorridaDelChat } from "./hablar-con-nexus";

const MODOS = { modoDelChat: "chat-de-nexus", modoDeLaRespuesta: "chat-de-nexus-respuesta", botonPregunta: "era-una-pregunta", botonNota: "guardarlo-como-nota" };
const vuelta = (output: unknown, o: Partial<CorridaDelChat> = {}): CorridaDelChat => ({ modo: "chat-de-nexus", boton: null, email: "liz@smarteam.test", output: JSON.stringify(output), ...o });

describe("el conteo de «Hablar con Nexus» en «Uso de Nexus»", () => {
  it("cuenta vueltas, preguntas, notas guardadas, botones y lo hecho con cada cambio", () => {
    const c = contarHablarConNexus(
      [
        vuelta({ tipo: "pregunta", preguntas: ["¿Es al mes?"] }),
        vuelta({ tipo: "listo", cambios: [{ id: "a" }, { id: "b" }, { id: "c" }], notaClave: "sabido:x", estados: { a: "aplicado", b: "descartado" } }),
        vuelta({ tipo: "listo", cambios: [{ id: "d" }] }, { email: "marco@smarteam.test", boton: "guardarlo-como-nota" }),
        vuelta({ tipo: "consulta" }, { boton: "era-una-pregunta" }),
        { modo: "chat-de-nexus-respuesta", boton: null, email: "liz@smarteam.test", output: null },
        vuelta(null, { output: "no es json" }),
      ],
      MODOS,
    );
    expect(c).toEqual({
      vueltas: 5,
      preguntasRespondidas: 1,
      notasGuardadas: 1,
      eraUnaPregunta: 1,
      guardarloComoNota: 1,
      cambiosPropuestos: 4,
      cambiosAplicados: 1,
      cambiosDescartados: 1,
      personas: 2,
    });
  });

  it("sin corridas, todo en cero", () => {
    expect(contarHablarConNexus([], MODOS).vueltas).toBe(0);
  });
});
