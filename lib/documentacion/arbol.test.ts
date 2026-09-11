import { describe, expect, it } from "vitest";
import {
  armarArbol,
  puedeMover,
  ramaDe,
  reordenar,
  rutaDe,
  slugDesdeTitulo,
  slugLibre,
} from "./arbol";
import type { NodoDePagina, NodoDelArbol } from "./tipos";

const n = (id: string, parentId: string | null, orden = 0, titulo = id): NodoDePagina => ({
  id,
  parentId,
  slug: id,
  titulo,
  icono: null,
  orden,
  bloqueada: false,
  fija: false,
});

/** Todos los ids del árbol, en recorrido en profundidad. */
function ids(arbol: NodoDelArbol[]): string[] {
  return arbol.flatMap((h) => [h.id, ...ids(h.hijas)]);
}

describe("armarArbol", () => {
  it("cuelga cada página de su padre y ordena las hermanas", () => {
    const arbol = armarArbol([n("b", null, 1), n("a", null, 0), n("a2", "a", 1), n("a1", "a", 0)]);
    expect(arbol.map((h) => h.id)).toEqual(["a", "b"]);
    expect(arbol[0].hijas.map((h) => h.id)).toEqual(["a1", "a2"]);
  });

  it("con el mismo orden, desempata por título", () => {
    const arbol = armarArbol([n("x", null, 0, "Zeta"), n("y", null, 0, "Alfa")]);
    expect(arbol.map((h) => h.titulo)).toEqual(["Alfa", "Zeta"]);
  });

  it("una página cuyo padre no está en la lista sube a la raíz", () => {
    const arbol = armarArbol([n("hija", "archivado")]);
    expect(arbol.map((h) => h.id)).toEqual(["hija"]);
  });

  it("un ciclo en los datos no hace desaparecer páginas", () => {
    const arbol = armarArbol([n("a", "b"), n("b", "a"), n("c", null)]);
    expect(ids(arbol).sort()).toEqual(["a", "b", "c"]);
  });

  it("una página que se nombra a sí misma como padre queda en la raíz", () => {
    expect(armarArbol([n("a", "a")]).map((h) => h.id)).toEqual(["a"]);
  });
});

describe("rutaDe", () => {
  const nodos = [n("raiz", null), n("medio", "raiz"), n("hoja", "medio")];

  it("devuelve desde la raíz hasta la página", () => {
    expect(rutaDe("hoja", nodos).map((x) => x.id)).toEqual(["raiz", "medio", "hoja"]);
  });

  it("no se cuelga con un ciclo", () => {
    expect(rutaDe("a", [n("a", "b"), n("b", "a")]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("una página que no existe da una ruta vacía", () => {
    expect(rutaDe("nada", nodos)).toEqual([]);
  });
});

describe("ramaDe", () => {
  it("incluye la página y todo lo que cuelga, pero no a sus hermanas", () => {
    const nodos = [n("a", null), n("a1", "a"), n("a1x", "a1"), n("b", null)];
    expect(ramaDe("a", nodos).sort()).toEqual(["a", "a1", "a1x"]);
  });
});

describe("puedeMover", () => {
  const nodos = [n("a", null), n("a1", "a"), n("a1x", "a1"), n("b", null)];

  it("a la raíz, siempre", () => {
    expect(puedeMover("a1", null, nodos)).toEqual({ ok: true });
  });

  it("debajo de otra rama, sí", () => {
    expect(puedeMover("a1", "b", nodos)).toEqual({ ok: true });
  });

  it("adentro de sí misma, no", () => {
    expect(puedeMover("a", "a", nodos).ok).toBe(false);
  });

  it("adentro de una de sus subpáginas, no (sería un ciclo)", () => {
    const r = puedeMover("a", "a1x", nodos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/subpáginas/);
  });

  it("a un destino que no existe, no", () => {
    expect(puedeMover("a1", "fantasma", nodos).ok).toBe(false);
  });
});

describe("reordenar", () => {
  const hermanas = [
    { id: "x", orden: 0 },
    { id: "y", orden: 1 },
    { id: "z", orden: 2 },
  ];

  it("inserta en la posición pedida y deja el orden denso", () => {
    expect(reordenar(hermanas, "nueva", 1)).toEqual([
      { id: "x", orden: 0 },
      { id: "nueva", orden: 1 },
      { id: "y", orden: 2 },
      { id: "z", orden: 3 },
    ]);
  });

  it("mover una hermana dentro de la misma lista no la duplica", () => {
    expect(reordenar(hermanas, "z", 0).map((h) => h.id)).toEqual(["z", "x", "y"]);
  });

  it("un índice fuera de rango la manda al borde", () => {
    expect(reordenar(hermanas, "w", 99).map((h) => h.id)).toEqual(["x", "y", "z", "w"]);
    expect(reordenar(hermanas, "w", -5).map((h) => h.id)).toEqual(["w", "x", "y", "z"]);
  });
});

describe("slug", () => {
  it("saca tildes, signos y mayúsculas", () => {
    expect(slugDesdeTitulo("¿Cómo funciona Nexus?")).toBe("como-funciona-nexus");
    expect(slugDesdeTitulo("Escala de rendimiento")).toBe("escala-de-rendimiento");
  });

  it("un título sin letras ni números cae a «pagina»", () => {
    expect(slugDesdeTitulo("¿?¡!")).toBe("pagina");
  });

  it("corta en 60 caracteres sin dejar un guion colgando", () => {
    const s = slugDesdeTitulo("palabra ".repeat(20));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });

  it("busca el primer slug libre", () => {
    expect(slugLibre("ventas", new Set())).toBe("ventas");
    expect(slugLibre("ventas", new Set(["ventas", "ventas-2"]))).toBe("ventas-3");
  });
});
