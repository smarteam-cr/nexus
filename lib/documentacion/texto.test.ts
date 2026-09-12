import { describe, expect, it } from "vitest";
import {
  fragmentoDe,
  normalizarConPosiciones,
  sanearBloques,
  textoDeBloques,
  textoDeBusqueda,
} from "./texto";
import type { BloqueGuardado } from "./tipos";

describe("textoDeBloques", () => {
  it("un renglón por bloque, con el texto de las piezas en línea y de los enlaces", () => {
    const bloques: BloqueGuardado[] = [
      { type: "heading", content: "Los niveles" },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Funcional es ", styles: {} },
          { type: "text", text: "la base", styles: { bold: true } },
          { type: "link", href: "https://x", content: [{ type: "text", text: " (ver)", styles: {} }] },
        ],
      },
    ];
    expect(textoDeBloques(bloques)).toBe("Los niveles\nFuncional es la base (ver)");
  });

  it("recorre los hijos (el contenido de un desplegable)", () => {
    const bloques: BloqueGuardado[] = [
      { type: "toggleListItem", content: "Deficiente", children: [{ type: "paragraph", content: "Sin proceso." }] },
    ];
    expect(textoDeBloques(bloques)).toBe("Deficiente\nSin proceso.");
  });

  it("una tarjeta aporta su título y su cuerpo (si no, no se encontraría al buscar)", () => {
    const bloques: BloqueGuardado[] = [
      {
        type: "tarjetas",
        props: { columnas: "2" },
        children: [
          {
            type: "tarjeta",
            content: "No es el CRM",
            children: [{ type: "paragraph", content: "La etapa se mueve en HubSpot." }],
          },
        ],
      },
    ];
    expect(textoDeBloques(bloques)).toBe("No es el CRM\nLa etapa se mueve en HubSpot.");
  });

  it("las tablas salen fila por fila, con las celdas separadas", () => {
    const bloques: BloqueGuardado[] = [
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: ["Nivel", "Valor"] },
            { cells: [[{ type: "text", text: "Óptimo", styles: {} }], { type: "tableCell", content: "5" }] },
          ],
        },
      },
    ];
    expect(textoDeBloques(bloques)).toBe("Nivel · Valor\nÓptimo · 5");
  });

  it("el enlace a otra página aporta su título (si no, buscar no lo encontraría)", () => {
    const bloques: BloqueGuardado[] = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "La vara está en ", styles: {} },
          {
            type: "mencion",
            props: { paginaId: "abc", slug: "escala-de-rendimiento", titulo: "Escala de rendimiento", icono: "" },
          },
          { type: "text", text: ".", styles: {} },
        ],
      },
    ];
    expect(textoDeBloques(bloques)).toBe("La vara está en Escala de rendimiento.");
  });

  it("los bloques sin texto no dejan renglones vacíos", () => {
    expect(textoDeBloques([{ type: "divider" }, { type: "paragraph", content: "  " }])).toBe("");
  });
});

describe("textoDeBusqueda", () => {
  it("junta título, texto y lo derivado, sin tildes ni mayúsculas", () => {
    expect(textoDeBusqueda("¿Cómo funciona?", "Etapa de Adopción", "Kickoff")).toBe(
      "¿como funciona?\netapa de adopcion\nkickoff",
    );
  });
});

describe("normalizarConPosiciones", () => {
  it("conserva el largo, así los índices apuntan al mismo lugar del original", () => {
    const original = "Ñandú y Óptimo";
    const normal = normalizarConPosiciones(original);
    expect(normal).toBe("nandu y optimo");
    expect(normal.length).toBe(original.length);
  });
});

describe("fragmentoDe", () => {
  it("encuentra la coincidencia sin importar tildes ni mayúsculas", () => {
    expect(fragmentoDe("Nivel Función: la base", "funcion")).toBe("Nivel Función: la base");
  });

  it("corta alrededor de la coincidencia y marca los cortes", () => {
    const texto = `${"a".repeat(100)} el piso, no el promedio ${"b".repeat(100)}`;
    const f = fragmentoDe(texto, "PROMEDIO", 10);
    expect(f?.startsWith("…")).toBe(true);
    expect(f?.endsWith("…")).toBe(true);
    expect(f).toContain("promedio");
  });

  it("con tildes ANTES de la coincidencia, el fragmento sigue apuntando bien", () => {
    const f = fragmentoDe("Ñandú, más, así: promedio", "promedio", 0);
    expect(f).toBe("…promedio");
  });

  it("sin coincidencia o con la consulta vacía devuelve null", () => {
    expect(fragmentoDe("hola", "chau")).toBeNull();
    expect(fragmentoDe("hola", "   ")).toBeNull();
  });
});

describe("sanearBloques", () => {
  it("conserva los bloques conocidos", () => {
    expect(sanearBloques([{ type: "paragraph", content: "hola" }])).toEqual([
      { type: "paragraph", content: "hola", children: [] },
    ]);
  });

  it("un bloque desconocido se vuelve párrafo con su texto, no desaparece", () => {
    expect(sanearBloques([{ id: "1", type: "misterio", content: "algo" }])).toEqual([
      { id: "1", type: "paragraph", content: "algo", children: [] },
    ]);
  });

  it("uno desconocido y sin texto deja una nota de qué había", () => {
    const [b] = sanearBloques([{ type: "image", props: { url: "x" } }]);
    expect(b.type).toBe("paragraph");
    expect(String(b.content)).toMatch(/image/);
  });

  it("sanea también los hijos, y descarta lo que no es un bloque", () => {
    expect(
      sanearBloques([
        "texto suelto",
        null,
        { type: "toggleListItem", content: "t", children: [{ type: "video" }] },
      ]),
    ).toEqual([
      {
        type: "toggleListItem",
        content: "t",
        children: [
          { type: "paragraph", content: "(Acá había un bloque «video» que el editor ya no muestra.)", children: [] },
        ],
      },
    ]);
  });

  it("la rejilla y sus tarjetas sobreviven enteras", () => {
    const bloques = sanearBloques([
      {
        type: "tarjetas",
        props: { columnas: "3" },
        children: [{ type: "tarjeta", content: "Título", children: [{ type: "paragraph", content: "Cuerpo" }] }],
      },
    ]);
    expect(bloques[0].type).toBe("tarjetas");
    expect(bloques[0].children?.[0].type).toBe("tarjeta");
    expect(bloques[0].children?.[0].children?.[0].content).toBe("Cuerpo");
  });

  it("algo que no es una lista da una página vacía", () => {
    expect(sanearBloques({ no: "lista" })).toEqual([]);
    expect(sanearBloques(undefined)).toEqual([]);
  });
});
