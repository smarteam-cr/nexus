import { describe, expect, it } from "vitest";
import { antesDeSubir, frenaLaSubida } from "./antes-de-subir";

const hero = { key: "hero", hidden: false, data: { titulo: "Propuesta" } };

describe("antesDeSubir", () => {
  it("sin contenido frena, como el servidor", () => {
    const a = antesDeSubir([{ key: "hero", hidden: false, data: { titulo: "" } }]);
    expect(frenaLaSubida(a)).toBe(true);
  });

  it("lo oculto no cuenta como contenido", () => {
    const a = antesDeSubir([{ ...hero, hidden: true }]);
    expect(frenaLaSubida(a)).toBe(true);
  });

  it("una licencia de Hub sin monto frena y dice cuál", () => {
    const a = antesDeSubir([
      hero,
      { key: "inversion", hidden: false, data: { licencias: [{ hub: "sales_hub", concepto: "Sales Hub", monto: "" }] } },
    ]);
    expect(frenaLaSubida(a)).toBe(true);
    expect(a[0].texto).toContain("Sales Hub");
  });

  it("un Hub vendido sin su licencia avisa, pero no frena", () => {
    const a = antesDeSubir([
      hero,
      { key: "solucion", hidden: false, data: { activos: ["sales_hub", "service_hub"] } },
      { key: "inversion", hidden: false, data: { licencias: [{ hub: "service_hub", concepto: "Service Hub", monto: "$200" }] } },
    ]);
    expect(frenaLaSubida(a)).toBe(false);
    expect(a.filter((x) => x.nivel === "aviso").map((x) => x.texto)).toEqual([
      "Sales Hub está en «Qué se implementa» y no tiene licencia en «Inversión».",
    ]);
    expect(a.some((x) => x.texto === "Todas las licencias tienen precio")).toBe(true);
  });

  it("cuenta las secciones con contenido y las ocultas", () => {
    const a = antesDeSubir([hero, { key: "faq", hidden: true, data: { x: "y" } }]);
    expect(a.at(-1)).toEqual({ nivel: "ok", texto: "1 sección con contenido · 1 oculta" });
  });
});
