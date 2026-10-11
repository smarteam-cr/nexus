import { describe, expect, it } from "vitest";
import { comprimirConversacion, conversacionComoTexto } from "./conversacion";

const TRANSCRIPCION = `FUNDAUNA | Presentación del diagnóstico - Transcripción
00:00:01

Caroline Bersot: Listo, chicos. Entonces vamos a ver la presentación del diagnóstico,
Fabio Lopez: He.
Caroline Bersot: cómo aterrizar el diagnóstico de lo que va a necesitar Funda.


00:00:49

Caroline Bersot: Entonces les voy a compartir pantalla.
y bueno, hoy Funda está invirtiendo en captar leads.
Fabio Lopez: Perfecto, yo te mando el Excel el jueves.

La transcripción finalizó después de 00:45:12

Esta transcripción editable se generó por computadora y puede contener errores.`;

describe("comprimirConversacion", () => {
  it("quita marcas de tiempo, encabezado y cierre; junta los turnos seguidos de la misma persona", () => {
    const c = comprimirConversacion(TRANSCRIPCION, 150_000);
    expect(c.recortada).toBe(false);
    expect(c.turnos.map((t) => [t.n, t.hablante])).toEqual([
      [1, "Caroline Bersot"],
      [2, "Fabio Lopez"],
      [3, "Caroline Bersot"],
      [4, "Fabio Lopez"],
    ]);
    // Dos líneas seguidas de Caroline (separadas por una marca de tiempo) son un turno; la línea sin nombre la sigue.
    expect(c.turnos[2].texto).toBe("cómo aterrizar el diagnóstico de lo que va a necesitar Funda. Entonces les voy a compartir pantalla. y bueno, hoy Funda está invirtiendo en captar leads.");
    expect(conversacionComoTexto(c.turnos)).toContain("[4] Fabio Lopez: Perfecto, yo te mando el Excel el jueves.");
    expect(conversacionComoTexto(c.turnos)).not.toMatch(/00:00|finalizó|generó por computadora/);
  });

  it("no corta en silencio: con un tope chico se queda con los primeros turnos enteros y lo dice", () => {
    const c = comprimirConversacion(TRANSCRIPCION, 120);
    expect(c.recortada).toBe(true);
    expect(c.turnos.length).toBeGreaterThan(0);
    expect(c.turnos.length).toBeLessThan(4);
    expect(c.caracteres).toBeGreaterThan(120);
  });

  it("sin conversación no hay turnos", () => {
    expect(comprimirConversacion("Reunión - Transcripción\n00:00:00\n\n", 1_000)).toEqual({ turnos: [], recortada: false, caracteres: 0 });
  });
});
