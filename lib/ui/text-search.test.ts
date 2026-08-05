import { describe, it, expect } from "vitest";
import { normalizarTexto, coincideBusqueda, filtrarPorBusqueda } from "./text-search";

/**
 * lib/ui/text-search.test.ts — el refactor que sacó la búsqueda de `<Table>` no cambió nada.
 *
 * Es un refactor de cero comportamiento sobre una primitiva que usan 9 pantallas. Lo que
 * congela: los acentos siguen matcheando (media cartera tiene tildes en el nombre) y una
 * consulta en blanco devuelve la MISMA referencia — los consumidores encadenan esto dentro de
 * un `useMemo`, y devolver un array nuevo en cada tecleo invalidaría los memos de abajo.
 */

describe("normalizarTexto", () => {
  it("saca acentos, baja a minúsculas y recorta", () => {
    expect(normalizarTexto("  Areyá  ")).toBe("areya");
    expect(normalizarTexto("PEÑA")).toBe("pena");
    expect(normalizarTexto("Judesur")).toBe("judesur");
  });
});

describe("coincideBusqueda", () => {
  it("una consulta en blanco matchea todo", () => {
    expect(coincideBusqueda("lo que sea", "")).toBe(true);
    expect(coincideBusqueda("lo que sea", "   ")).toBe(true);
  });

  it("busca sin acentos en las dos direcciones", () => {
    expect(coincideBusqueda("Areyá Costa Rica", "areya")).toBe(true);
    expect(coincideBusqueda("Areya Costa Rica", "areyá")).toBe(true);
  });

  it("no matchea lo que no está", () => {
    expect(coincideBusqueda("Wherex", "judesur")).toBe(false);
  });
});

describe("filtrarPorBusqueda", () => {
  const filas = [{ n: "Areyá" }, { n: "Wherex" }, { n: "SmartAgro" }];
  const texto = (f: { n: string }) => f.n;

  it("LA guarda: sin consulta devuelve la MISMA referencia", () => {
    /* Si devolviera una copia, cada tecleo en un campo vacío rompería los `useMemo` que
       cuelgan de esto. La edición que lo rompe: `return [...filas]`. */
    expect(filtrarPorBusqueda(filas, texto, "")).toBe(filas);
    expect(filtrarPorBusqueda(filas, texto, "  ")).toBe(filas);
  });

  it("filtra por coincidencia parcial y sin acentos", () => {
    expect(filtrarPorBusqueda(filas, texto, "areya")).toEqual([{ n: "Areyá" }]);
    expect(filtrarPorBusqueda(filas, texto, "agro")).toEqual([{ n: "SmartAgro" }]);
    expect(filtrarPorBusqueda(filas, texto, "zzz")).toEqual([]);
  });
});
