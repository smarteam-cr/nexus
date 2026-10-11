import { describe, expect, it } from "vitest";
import { alertaDesdeHecho, esDeLaLectura, type QuejaDeLaLectura, type ReunionDeLaQueja } from "./alertas-de-la-lectura";
import { citaDeLaEvidencia, CATEGORIAS_QUE_PINTAN } from "./cita-de-alerta";
import { idsDeLaEvidencia } from "./alertas-reglas";

const REUNION: ReunionDeLaQueja = { id: "s1", titulo: "Seguimiento semanal", fecha: "2026-10-08", puertasAdentro: false };
const QUEJA: QuejaDeLaLectura = {
  hechoId: "h1",
  tipo: "queja",
  frase: "El cliente dice que las respuestas llegan tarde",
  cita: "la verdad es que nos están respondiendo muy tarde",
  quien: "cliente",
  quienComprobado: true,
  gravedad: "media",
  huella: "queja|cliente llegan respuestas tarde",
  fuenteDeLaCita: "transcripcion",
};

describe("el detector de la lectura (la queja verificada)", () => {
  it("una queja del cliente → QUEJA de cuenta, con la cita que lee la cartera", () => {
    const a = alertaDesdeHecho(QUEJA, "c1", REUNION)!;
    expect(a.category).toBe("QUEJA");
    expect(CATEGORIAS_QUE_PINTAN.has(a.category)).toBe(true);
    expect(a.severity).toBe("MEDIUM");
    expect(a.dedupeKey).toBe("lectura:c1:QUEJA:queja|cliente llegan respuestas tarde");
    expect(esDeLaLectura(a)).toBe(true);
    // La misma forma que escribe el vigía: pinta el color sin tocar la cartera.
    expect(citaDeLaEvidencia(a.evidence)).toEqual({ texto: QUEJA.cita, fuente: "reunion", id: "s1", fecha: "2026-10-08", titulo: "Seguimiento semanal" });
    // Otra reunión es evidencia nueva (la regla de reaparición).
    expect([...idsDeLaEvidencia(a.evidence)]).toContain("cita:s1");
    expect(a.evidence.detector).toBe("lectura");
    expect(a.evidence.hechoIds).toEqual(["h1"]);
  });

  it("alta → HIGH, y el motivo dice lo que dijo el cliente", () => {
    const a = alertaDesdeHecho({ ...QUEJA, gravedad: "alta" }, "c1", REUNION)!;
    expect(a.severity).toBe("HIGH");
    expect(a.reason).toContain(`el cliente dijo: «${QUEJA.cita}»`);
  });

  it("⛔ de las notas de Gemini (un resumen, no palabras del cliente) → nada: la juzga el vigía", () => {
    expect(alertaDesdeHecho({ ...QUEJA, fuenteDeLaCita: "notas" }, "c1", REUNION)).toBeNull();
  });

  it("⛔ «cliente» que dijo el modelo (un hablante dudoso) → nada", () => {
    expect(alertaDesdeHecho({ ...QUEJA, quienComprobado: false }, "c1", REUNION)).toBeNull();
    expect(alertaDesdeHecho({ ...QUEJA, quienComprobado: undefined }, "c1", REUNION)).toBeNull();
  });

  it("⛔ una reunión de puertas adentro → nada", () => {
    expect(alertaDesdeHecho(QUEJA, "c1", { ...REUNION, puertasAdentro: true })).toBeNull();
  });

  it("⛔ una queja dicha por Smarteam (o sin saber quién) → nada", () => {
    expect(alertaDesdeHecho({ ...QUEJA, quien: "smarteam" }, "c1", REUNION)).toBeNull();
    expect(alertaDesdeHecho({ ...QUEJA, quien: null }, "c1", REUNION)).toBeNull();
  });

  it("⛔ un riesgo no levanta alerta (va al vigía); un texto sumado a mano tampoco", () => {
    expect(alertaDesdeHecho({ ...QUEJA, tipo: "riesgo" }, "c1", REUNION)).toBeNull();
    expect(alertaDesdeHecho({ ...QUEJA, fuenteDeLaCita: "texto" }, "c1", REUNION)).toBeNull();
  });

  it("el título no pasa de 140 caracteres", () => {
    const a = alertaDesdeHecho({ ...QUEJA, frase: "x ".repeat(200) }, "c1", REUNION)!;
    expect(a.title.length).toBeLessThanOrEqual(140);
  });
});
