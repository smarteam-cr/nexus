/**
 * lib/finanzas/explicaciones.test.ts — cada número de Finanzas con su «Qué mide · De dónde sale» (2026-11-13).
 *
 * Una explicación a medias es peor que ninguna: el ⓘ promete las dos respuestas. Y el copy es de Finanzas, en tuteo:
 * ni voseo ni nombres de tablas.
 */
import { describe, expect, it } from "vitest";
import { EXPLICACIONES_EQUILIBRIO } from "./explicaciones";

describe("las explicaciones del punto de equilibrio", () => {
  const todas = Object.entries(EXPLICACIONES_EQUILIBRIO);

  it("todas dicen qué mide y de dónde sale, en frases completas", () => {
    for (const [clave, e] of todas) {
      expect(e.queMide.trim().length, `${clave}: qué mide`).toBeGreaterThan(20);
      expect(e.deDondeSale.trim().length, `${clave}: de dónde sale`).toBeGreaterThan(20);
      expect(e.queMide.trim().endsWith("."), `${clave}: qué mide termina en punto`).toBe(true);
      expect(e.deDondeSale.trim().endsWith("."), `${clave}: de dónde sale termina en punto`).toBe(true);
    }
  });

  it("no le habla al lector con nombres de tablas ni de código", () => {
    for (const [clave, e] of todas) {
      const texto = `${e.queMide} ${e.deDondeSale}`;
      expect(texto, clave).not.toMatch(/\b(VentaGanada|CierreMes|EgresoMensual|CostoRecurrente|PagoPlanilla|RESERVA_AGUINALDO|pipelineId)\b/);
    }
  });

  it("lo vendido aclara que suma todos los pipelines, también Customer Success, y que nada se cuenta dos veces", () => {
    const v = EXPLICACIONES_EQUILIBRIO.vendido.deDondeSale;
    expect(v).toMatch(/todos los pipelines/);
    expect(v).toMatch(/Customer Success/);
    expect(v).toMatch(/una sola vez/);
  });

  it("la provisión del aguinaldo dice que el pago no se suma otra vez", () => {
    expect(EXPLICACIONES_EQUILIBRIO.aguinaldo.deDondeSale).toMatch(/no se suma otra vez/);
  });
});
