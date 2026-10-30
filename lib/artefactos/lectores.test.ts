import { describe, expect, it } from "vitest";
import { ordenParaLosAgentes, prioridadParaUnValor, textoDeVariasCopias } from "./lectores";
import { COMO_LEER_VARIAS_COPIAS } from "./copias";

const doc = (id: string, order: number, creado: string, terminado: string | null = null) => ({
  id,
  order,
  createdAt: new Date(creado),
  terminadoEn: terminado ? new Date(terminado) : null,
});

describe("ordenParaLosAgentes: terminados primero, y adentro el orden de la persona", () => {
  it("una terminada que la persona puso última se lee primero", () => {
    const docs = [doc("a", 0, "2026-10-01"), doc("b", 1, "2026-10-02"), doc("c", 2, "2026-10-03", "2026-10-20")];
    expect(ordenParaLosAgentes(docs).map((d) => d.id)).toEqual(["c", "a", "b"]);
  });
  it("con el mismo orden, la más vieja primero", () => {
    const docs = [doc("nueva", 0, "2026-10-05"), doc("vieja", 0, "2026-10-01")];
    expect(ordenParaLosAgentes(docs).map((d) => d.id)).toEqual(["vieja", "nueva"]);
  });
});

describe("prioridadParaUnValor: el terminado más reciente, si no el primero de la persona", () => {
  it("de dos terminados, el más reciente", () => {
    const docs = [doc("a", 0, "2026-10-01", "2026-10-10"), doc("b", 1, "2026-10-02", "2026-10-25"), doc("c", 2, "2026-10-03")];
    expect(prioridadParaUnValor(docs).map((d) => d.id)).toEqual(["b", "a", "c"]);
  });
  it("sin terminados, el orden de la persona", () => {
    const docs = [doc("b", 1, "2026-10-01"), doc("a", 0, "2026-10-02")];
    expect(prioridadParaUnValor(docs).map((d) => d.id)).toEqual(["a", "b"]);
  });
  it("un solo documento es el mismo de siempre", () => {
    expect(prioridadParaUnValor([doc("unico", 3, "2026-01-01")]).map((d) => d.id)).toEqual(["unico"]);
  });
});

describe("textoDeVariasCopias", () => {
  it("con una sola copia con texto, su texto tal cual (byte a byte)", () => {
    const texto = "[Sección: Objetivos]\n- Bajar el tiempo de respuesta";
    expect(textoDeVariasCopias([{ rotulo: "Diagnóstico (en construcción)", texto }])).toBe(texto);
    expect(textoDeVariasCopias([{ rotulo: "x", texto }, { rotulo: "y", texto: "  " }])).toBe(texto);
  });
  it("sin texto en ninguna, vacío", () => {
    expect(textoDeVariasCopias([])).toBe("");
    expect(textoDeVariasCopias([{ rotulo: "x", texto: "" }])).toBe("");
  });
  it("con dos, el aviso arriba y cada una con su rótulo, en el orden recibido", () => {
    const t = textoDeVariasCopias([
      { rotulo: "Planificación — Marketing (terminado)", texto: "A" },
      { rotulo: "Planificación (en construcción)", texto: "B" },
    ]);
    expect(t).toBe(`${COMO_LEER_VARIAS_COPIAS}\n\n=== Planificación — Marketing (terminado) ===\nA\n\n=== Planificación (en construcción) ===\nB`);
  });
});
