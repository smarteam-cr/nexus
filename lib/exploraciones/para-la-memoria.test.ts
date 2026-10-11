/**
 * lib/exploraciones/para-la-memoria.test.ts — lo aprendido en la preventa, para la memoria interna: sin el encabezado
 * largo del handoff, con lo interno rotulado y dentro del tope.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./servidor", () => ({ exploracionParaLaPropuesta: vi.fn() }));

import { textoDeLoAprendido, TOPE_DE_LA_PREVENTA_EN_LA_MEMORIA } from "./para-la-memoria";

const BLOQUE = [
  "=== EXPLORACIÓN DE VENTA (ESTIMADO: sirve para saber dónde mirar, no es evidencia) ===",
  "La armó el vendedor con el prospecto antes del cierre. Todo lo de acá es ESTIMADO…",
  "",
  "Industria (edición de la escala): Educación.",
  "",
  "## Nivel estimado de cada área",
  "- Ventas: base operativa Inicial, producción Deficiente.",
].join("\n");

const INTERNO = [
  { etiqueta: "Presupuesto", lineas: ["US$20.000 al año"] },
  { etiqueta: "Quién decide", lineas: ["Ana, directora (firma)"] },
  { etiqueta: "Vacía", lineas: [] },
];

describe("textoDeLoAprendido", () => {
  it("lo interno primero y rotulado; el bloque del handoff sin su encabezado largo", () => {
    const t = textoDeLoAprendido(BLOQUE, INTERNO, 3000);
    expect(t.startsWith("### Presupuesto (INTERNO — nunca se cita al cliente)\n- US$20.000 al año")).toBe(true);
    expect(t).toContain("### Quién decide (INTERNO — nunca se cita al cliente)\n- Ana, directora (firma)");
    expect(t).not.toContain("Vacía");
    expect(t).not.toContain("=== EXPLORACIÓN DE VENTA");
    expect(t).not.toContain("La armó el vendedor");
    expect(t).toContain("- Ventas: base operativa Inicial, producción Deficiente.");
  });

  it("nunca pasa del tope, y lo interno no se come más de la mitad", () => {
    const largo = [{ etiqueta: "Objeciones", lineas: Array.from({ length: 200 }, (_, i) => `objeción ${i}`) }];
    const t = textoDeLoAprendido(`${BLOQUE}\n${"- más\n".repeat(400)}`, largo, 1500);
    expect(t.length).toBeLessThanOrEqual(1500);
    expect(t).toContain("(…recortado)");
    expect(t).toContain("Industria (edición de la escala)");
    expect(TOPE_DE_LA_PREVENTA_EN_LA_MEMORIA).toBe(3000);
  });

  it("sin nada, vacío", () => {
    expect(textoDeLoAprendido("", [], 3000)).toBe("");
  });
});
