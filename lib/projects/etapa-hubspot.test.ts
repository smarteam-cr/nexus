/**
 * lib/projects/etapa-hubspot.test.ts — MOVER LA TARJETA DE COLUMNA ES MÁS CARO QUE CAMBIAR UN
 * RÓTULO.
 *
 * La etapa es lo que ve todo el equipo en el tablero de HubSpot, y es el «ancla #1» del cronograma
 * vivo. Este archivo fija las tres reglas que hacen que una sugerencia de etapa sea segura:
 * el id sale de la tabla del pipeline correcto, las terminales no se proponen, y el aviso dice
 * de dónde a dónde.
 */
import { describe, expect, it } from "vitest";
import { PROJECT_PIPELINES, type PipelineDef } from "./kind";
import { etapasProponibles, proponerEtapa, saltoDeEtapas } from "./etapa-hubspot";

/** `PROJECT_PIPELINES` es un ARRAY (el orden importa para el desplegable del alta). */
const porClave = (k: string): PipelineDef => {
  const def = PROJECT_PIPELINES.find((d) => d.key === k);
  if (!def) throw new Error(`pipeline ${k} no está en la tabla`);
  return def;
};
const CS = porClave("customer-success");
const DEV = porClave("development");

describe("⛔ el id de etapa NUNCA se inventa", () => {
  it("una etapa que no existe en ESE pipeline no se propone", () => {
    expect(proponerEtapa(CS, null, "id-que-no-existe", "porque sí")).toBeNull();
  });

  it("⚠ un id del pipeline VECINO tampoco", () => {
    /* Es el error caro: «Handoff» existe en los tres pipelines con ids DISTINTOS. Aceptar el id
       de otro tablero manda el registro a una columna que en el suyo no existe. */
    const handoffDeDev = DEV.initialStageId;
    expect(handoffDeDev).not.toBe(CS.initialStageId);
    expect(proponerEtapa(CS, null, handoffDeDev, "porque sí")).toBeNull();
  });

  it("todas las proponibles salen de la tabla del pipeline", () => {
    for (const def of PROJECT_PIPELINES) {
      for (const e of etapasProponibles(def)) {
        expect(
          def.stages.some((s) => s.id === e.id),
          `${def.key}: ${e.id} no está en stages`,
        ).toBe(true);
      }
    }
  });
});

describe("⛔ una etapa TERMINAL no se propone", () => {
  it("mover a una terminal cierra el proyecto: no sale de una sugerencia", () => {
    /* Lo saca de la cartera y toca cobranza — las mismas consecuencias que escribir `completed`
       en el estado, y el mismo problema: no está resuelto cómo se deshace. */
    for (const def of PROJECT_PIPELINES) {
      for (const cerrada of def.closedStageIds) {
        expect(
          proponerEtapa(def, null, cerrada, "el cliente firmó la entrega"),
          `${def.key}: se propuso la etapa terminal ${cerrada}`,
        ).toBeNull();
      }
    }
  });

  it("ninguna terminal aparece entre las proponibles", () => {
    for (const def of PROJECT_PIPELINES) {
      const ids = etapasProponibles(def).map((e) => e.id);
      for (const cerrada of def.closedStageIds) {
        expect(ids, `${def.key}: ${cerrada} es terminal y es proponible`).not.toContain(cerrada);
      }
    }
  });
});

describe("la propuesta dice de dónde a dónde", () => {
  const destino = etapasProponibles(CS)[2];

  it("trae las dos puntas, no solo la nueva", () => {
    /* Cambiar la etapa mueve la tarjeta de columna para todo el equipo. Quien acepta tiene que
       poder ver qué va a cambiar de lugar, no solo dónde va a quedar. */
    const p = proponerEtapa(CS, CS.initialStageId, destino.id, "el kickoff ya se hizo");
    expect(p?.hasta).toBe(destino.label);
    expect(p?.desde, "el aviso no dice de dónde sale").toBeTruthy();
    expect(p?.motivo).toContain("kickoff");
  });

  it("con la etapa vacía, `desde` es null y no una invención", () => {
    const p = proponerEtapa(CS, null, destino.id, "hay evidencia");
    expect(p?.desde).toBeNull();
  });

  it("NO propone la etapa donde ya está", () => {
    expect(proponerEtapa(CS, destino.id, destino.id, "hay evidencia")).toBeNull();
  });
});

describe("cuánto se mueve", () => {
  it("un salto hacia adelante es positivo, y hacia atrás negativo", () => {
    /* Sirve para el copy: «avanza 1 etapa» se acepta distinto que «avanza 4», y un salto grande
       merece que alguien lo mire dos veces antes de mover la tarjeta. */
    const linea = etapasProponibles(CS);
    expect(saltoDeEtapas(CS, linea[0].id, linea[2].id)).toBe(2);
    expect(saltoDeEtapas(CS, linea[2].id, linea[0].id)).toBe(-2);
  });

  it("null cuando alguna queda fuera de la línea de avance", () => {
    expect(saltoDeEtapas(CS, "no-existe", etapasProponibles(CS)[0].id)).toBeNull();
  });
});
