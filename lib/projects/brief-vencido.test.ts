import { describe, expect, it } from "vitest";
import { evaluarFrescura, type SenalesDeFrescura } from "./brief-vencido";

/**
 * lib/projects/brief-vencido.test.ts — UN RESUMEN VIEJO QUE SE VE FRESCO ES PEOR QUE NINGUNO.
 *
 * El que no existe se nota; el viejo se cita en una llamada. Este archivo fija cuándo el resumen
 * de un proyecto queda atrás y —lo que más importa— que el motivo sea COMPLETO: quedarse con la
 * primera razón escondería la mitad de lo que cambió.
 */

const GEN = new Date("2026-08-10T12:00:00Z");
const DESPUES = new Date("2026-08-14T09:00:00Z");
const ANTES = new Date("2026-08-01T09:00:00Z");

const senales = (over: Partial<SenalesDeFrescura> = {}): SenalesDeFrescura => ({
  ultimaSesionConContenido: null,
  handoffActualizadoEn: null,
  etapaSincronizadaEn: null,
  ultimaDesviacionEn: null,
  marcadoVencidoEn: null,
  ...over,
});

describe("qué vence un resumen", () => {
  it("nada posterior → está al día", () => {
    const r = evaluarFrescura(GEN, senales({ ultimaSesionConContenido: ANTES }));
    expect(r.vencido).toBe(false);
    expect(r.motivo).toBeNull();
  });

  it("una reunión nueva lo vence", () => {
    const r = evaluarFrescura(GEN, senales({ ultimaSesionConContenido: DESPUES }));
    expect(r.vencido).toBe(true);
    expect(r.motivo).toContain("reunión nueva");
  });

  it.each([
    ["handoffActualizadoEn", "handoff"],
    ["etapaSincronizadaEn", "etapa"],
    ["ultimaDesviacionEn", "desviación"],
  ] as const)("%s posterior lo vence y lo nombra", (campo, palabra) => {
    /* Los cuatro inputs tienen que contar. Si alguno se cayera de la lista, el resumen se vería
       fresco sobre algo que cambió — y nada se rompería, que es lo que lo vuelve peligroso. */
    const r = evaluarFrescura(GEN, senales({ [campo]: DESPUES }));
    expect(r.vencido, `${campo} dejó de vencer el resumen`).toBe(true);
    expect(r.motivo).toContain(palabra);
  });
});

describe("⭐ el motivo dice TODO lo que cambió, no lo primero", () => {
  it("dos cambios se enumeran con «y»", () => {
    /* «hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa» piden atención
       distinta: con lo primero alguien regenera, con lo segundo además revisa el cronograma. */
    const r = evaluarFrescura(
      GEN,
      senales({ ultimaSesionConContenido: DESPUES, etapaSincronizadaEn: DESPUES }),
    );
    expect(r.motivo).toContain("reunión nueva");
    expect(r.motivo).toContain("etapa");
    expect(r.motivo, "los motivos no se unieron como frase").toMatch(/ y /);
  });

  it("tres o más se separan con coma y el último con «y»", () => {
    const r = evaluarFrescura(
      GEN,
      senales({
        ultimaSesionConContenido: DESPUES,
        handoffActualizadoEn: DESPUES,
        etapaSincronizadaEn: DESPUES,
      }),
    );
    expect(r.motivo).toMatch(/, .+ y /);
  });

  it("uno solo NO lleva coma ni «y» colgando", () => {
    /* ⚠ Se mira la ENUMERACIÓN, no la frase entera: la plantilla («Desde que se generó, …») ya
       trae su propia coma, y un assert sobre el texto completo estaría probando la plantilla. */
    const r = evaluarFrescura(GEN, senales({ handoffActualizadoEn: DESPUES }));
    const lista = r.motivo!.split("generó, ")[1];
    expect(lista).not.toMatch(/,/);
    expect(lista).not.toMatch(/ y /);
  });
});

describe("la marca explícita convive con lo derivado", () => {
  it("marcado a mano vence aunque las fechas no lo muestren", () => {
    const r = evaluarFrescura(GEN, senales({ marcadoVencidoEn: DESPUES }));
    expect(r.vencido).toBe(true);
    expect(r.motivo).toContain("desactualizado");
  });

  it("⚠ la marca SE SUMA a lo derivado, no lo reemplaza", () => {
    /* Si la marca cortocircuitara, el aviso diría solo «se marcó como desactualizado» y ocultaría
       que además hubo una reunión — que es la parte accionable. */
    const r = evaluarFrescura(
      GEN,
      senales({ marcadoVencidoEn: DESPUES, ultimaSesionConContenido: DESPUES }),
    );
    expect(r.motivo).toContain("reunión nueva");
    expect(r.motivo).toContain("desactualizado");
  });

  it("una marca ANTERIOR a la generación no vence: ese resumen ya la contempló", () => {
    // Es el caso de regenerar después de que algo marcó: el resumen nuevo ya nació con eso.
    expect(evaluarFrescura(GEN, senales({ marcadoVencidoEn: ANTES })).vencido).toBe(false);
  });
});

describe("sin resumen todavía", () => {
  it("no está «vencido»: es otro estado", () => {
    /* Un proyecto sin resumen no tiene nada viejo que corregir. Devolver `vencido: true` haría
       que la pantalla muestre un cartel de desactualizado sobre algo que nunca existió. */
    const r = evaluarFrescura(null, senales({ ultimaSesionConContenido: DESPUES }));
    expect(r.vencido).toBe(false);
    expect(r.motivo).toBeNull();
  });
});
