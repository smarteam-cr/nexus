/**
 * lib/canvas/diagnostico-confirmado.test.ts — cuánto de lo que lee el diagnóstico está confirmado (2026-10-23).
 */
import { describe, it, expect } from "vitest";
import { loConfirmadoDelDiagnostico, mensajeDeSupuestos, type EntradaDeLoConfirmado } from "./diagnostico-confirmado";

const vacio: EntradaDeLoConfirmado = {
  ficha: { confirmada: false, camposPropuestos: 0 },
  resultados: { total: 0, confirmados: 0 },
  procesos: { total: 0, validados: 0 },
  exploracionDelProyecto: { existe: false, confirmados: 0, propuestos: 0 },
  reuniones: 0,
};

/** CEMACO el 23 oct, medido en producción (scripts/medir-contexto-del-diagnostico.ts). */
const CEMACO: EntradaDeLoConfirmado = {
  ficha: { confirmada: false, camposPropuestos: 9 },
  resultados: { total: 5, confirmados: 0 },
  procesos: { total: 2, validados: 0 },
  exploracionDelProyecto: { existe: true, confirmados: 71, propuestos: 8 },
  reuniones: 5,
};

describe("lo confirmado del diagnóstico", () => {
  it("CEMACO: 1 de 4 piezas con algo confirmado → casi nada; pide revisar la ficha, los resultados y los procesos", () => {
    const r = loConfirmadoDelDiagnostico(CEMACO);
    expect(r.casiNada).toBe(true);
    expect(r.conAlgoConfirmado).toBe(1);
    expect(r.conAlgo).toBe(4);
    expect(r.piezas.map((p) => [p.clave, p.estado])).toEqual([
      ["ficha", "sin-confirmar"],
      ["resultados", "sin-confirmar"],
      ["procesos", "sin-confirmar"],
      ["exploracion", "en-parte"],
    ]);
    expect(r.piezas[1].texto).toContain("«Por validar»");
    const m = mensajeDeSupuestos(r);
    expect(m).toContain("Solo 1 de 4");
    expect(m).toContain("la ficha del cliente, los resultados medibles del handoff y los procesos del cliente");
    expect(m).toContain("supuestos que nadie validó");
  });

  it("la mitad confirmada ya no es «casi nada»", () => {
    const r = loConfirmadoDelDiagnostico({ ...CEMACO, ficha: { confirmada: true, camposPropuestos: 0 } });
    expect(r.conAlgoConfirmado).toBe(2);
    expect(r.casiNada).toBe(false);
  });

  it("sin ninguna fuente, casi nada (y lo dice sin contar)", () => {
    const r = loConfirmadoDelDiagnostico(vacio);
    expect(r.casiNada).toBe(true);
    expect(r.piezas.every((p) => p.estado === "sin-datos")).toBe(true);
    expect(mensajeDeSupuestos(r)).toContain("todavía no tiene nada confirmado");
  });

  it("lo vacío no cuenta para el veredicto: una sola pieza, confirmada, alcanza", () => {
    const r = loConfirmadoDelDiagnostico({ ...vacio, exploracionDelProyecto: { existe: true, confirmados: 3, propuestos: 0 } });
    expect(r.conAlgo).toBe(1);
    expect(r.casiNada).toBe(false);
  });

  it("los estados de cada pieza", () => {
    const r = loConfirmadoDelDiagnostico({
      ficha: { confirmada: true, camposPropuestos: 2 },
      resultados: { total: 3, confirmados: 1 },
      procesos: { total: 2, validados: 2 },
      exploracionDelProyecto: { existe: true, confirmados: 0, propuestos: 4 },
      reuniones: 0,
    });
    expect(r.piezas.map((p) => p.estado)).toEqual(["en-parte", "en-parte", "confirmado", "sin-confirmar"]);
    // Tuteo en todo lo que se lee.
    for (const p of r.piezas) expect(p.texto).not.toMatch(/\b(tenés|podés|revisá|confirmá)\b/);
  });
});

describe("un ciclo de SmartLoop sin exploración (M2, 2026-10-24)", () => {
  const confirmado: EntradaDeLoConfirmado = {
    ...CEMACO,
    ficha: { confirmada: true, camposPropuestos: 0 },
    resultados: { total: 5, confirmados: 5 },
  };

  it("todo confirmado pero el ciclo sin ninguna reunión leída: pide confirmación con su propio motivo", () => {
    const r = loConfirmadoDelDiagnostico({ ...confirmado, ciclo: { numero: 1, lecturasDeExploracion: 0 } });
    expect(r.casiNada).toBe(false);
    expect(r.cicloSinExploracion).toBe(1);
    expect(r.pideConfirmacion).toBe(true);
    expect(mensajeDeSupuestos(r)).toMatch(/ciclo 1 de un servicio recurrente/);
    expect(mensajeDeSupuestos(r)).not.toMatch(/fuentes tienen algo confirmado/);
  });

  it("con una reunión leída en el ciclo, no pide nada", () => {
    const r = loConfirmadoDelDiagnostico({ ...confirmado, ciclo: { numero: 2, lecturasDeExploracion: 1 } });
    expect(r.cicloSinExploracion).toBeNull();
    expect(r.pideConfirmacion).toBe(false);
    expect(mensajeDeSupuestos(r)).toBe("");
  });

  it("los dos motivos juntos: el del ciclo primero", () => {
    const r = loConfirmadoDelDiagnostico({ ...CEMACO, ciclo: { numero: 1, lecturasDeExploracion: 0 } });
    const m = mensajeDeSupuestos(r);
    expect(m.indexOf("ciclo 1")).toBeLessThan(m.indexOf("Solo 1 de 4"));
  });

  it("fuera de un servicio recurrente, la regla de siempre", () => {
    const r = loConfirmadoDelDiagnostico(CEMACO);
    expect(r.cicloSinExploracion).toBeNull();
    expect(r.pideConfirmacion).toBe(r.casiNada);
  });
});
