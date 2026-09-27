/**
 * lib/flow/orden-de-presentacion.test.ts
 *
 * Correr: `npx vitest run lib/flow/orden-de-presentacion.test.ts --project unit`.
 *
 * Hay DOS listas de piezas —el orden en que ocurre el servicio y el orden en que se
 * muestra— y ésa es la decisión, no el descuido. Lo que este archivo impide es el descuido
 * que viene gratis con ella: que la segunda se quede vieja. El modo de falla es silencioso
 * —la pieza nueva se va al final del menú y nadie lo nota— así que la guarda no puede ser
 * "que no reviente": tiene que exigir que las dos listas hablen de lo mismo.
 */
import { describe, it, expect } from "vitest";
import { ORDEN_DE_PRESENTACION, ordenarParaPresentacion, piezasParaMostrar } from "./orden-de-presentacion";
import { piecesInFlowOrder } from "./stage-pieces";

describe("las dos listas hablan de las mismas piezas", () => {
  it("el orden de presentación cubre EXACTAMENTE las piezas del flujo", () => {
    const flujo = [...piecesInFlowOrder("full")].sort();
    const menu = [...ORDEN_DE_PRESENTACION].sort();
    expect(
      menu,
      "Agregaste o sacaste una pieza del flujo y `ORDEN_DE_PRESENTACION` quedó vieja.\n" +
        "No falla nada en producción: la pieza simplemente se va al FINAL del menú del " +
        "proyecto y nadie lo relaciona con tu commit. Declara dónde va.",
    ).toEqual(flujo);
  });

  it("no repite ninguna", () => {
    expect(new Set(ORDEN_DE_PRESENTACION).size).toBe(ORDEN_DE_PRESENTACION.length);
  });
});

describe("el orden que pidió negocio", () => {
  it("el cronograma va primero de los documentos: es el que se abre todos los días", () => {
    const sinHandoff = piezasParaMostrar().filter((s) => s !== "handoff");
    expect(sinHandoff[0]).toBe("timeline");
  });

  it("y el recorrido documental queda en su orden natural detrás", () => {
    expect(piezasParaMostrar()).toEqual([
      "handoff",
      "timeline",
      "kickoff",
      "exploration",
      "diagnosis",
      "planning",
      "implementation",
      "tech-requirements",
      "delivery",
    ]);
  });
});

describe("ordenarParaPresentacion", () => {
  it("ordena por el menú, no por cómo llegó la lista", () => {
    const entrada = ["delivery", "kickoff", "timeline"];
    expect(ordenarParaPresentacion(entrada, (s) => s)).toEqual(["timeline", "kickoff", "delivery"]);
  });

  it("lo que no reconoce va al final, conservando su orden relativo", () => {
    /* Los canvases sueltos del CSE entran por acá con un slug `custom:…`. Que caigan al
       final es la decisión; que se pierdan sería el bug. */
    const entrada = ["custom:a", "delivery", "custom:b", "kickoff"];
    expect(ordenarParaPresentacion(entrada, (s) => s)).toEqual([
      "kickoff",
      "delivery",
      "custom:a",
      "custom:b",
    ]);
  });

  it("es estable: dos piezas con el mismo orden conservan el de entrada", () => {
    const entrada = ["custom:z", "custom:a"];
    expect(ordenarParaPresentacion(entrada, (s) => s)).toEqual(["custom:z", "custom:a"]);
  });
});
