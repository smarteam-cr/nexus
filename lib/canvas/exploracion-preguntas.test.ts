/**
 * lib/canvas/exploracion-preguntas.test.ts
 *
 * Lo que se congela acá no es el formato nuevo —eso lo dice el tipo— sino las dos cosas
 * que se rompen en silencio: que el documento YA GENERADO (Wherex, 15 preguntas como
 * strings sueltos) siga leyéndose, y que el agente no pueda marcar una pregunta como
 * preguntada.
 */
import { describe, it, expect } from "vitest";
import {
  conservarMarcas,
  contarHechas,
  contarMarcasDelPlan,
  normalizarPregunta,
  normalizarPreguntas,
} from "./exploracion-preguntas";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";

describe("normalizar: el formato viejo sigue vivo", () => {
  it("un string suelto (formato de Wherex) se lee como pregunta sin texto perdido", () => {
    expect(normalizarPregunta("¿Por dónde entró el último negocio?")).toEqual({
      q: "¿Por dónde entró el último negocio?",
      repregunta: undefined,
      hecha: undefined,
    });
  });

  it("una lista mezclada (migración a medias) no rompe ni pierde nada", () => {
    const out = normalizarPreguntas(["vieja", { q: "nueva", repregunta: "si dice X…", hecha: "si" }]);
    expect(out.map((p) => p.q)).toEqual(["vieja", "nueva"]);
    expect(out[1].repregunta).toBe("si dice X…");
    expect(out[1].hecha).toBe("si");
  });

  it("basura (null, número, objeto sin q) degrada a vacío en vez de reventar el documento", () => {
    // El motor NUNCA debe romper por data mala: es la regla del resto del engine.
    expect(normalizarPreguntas([null, undefined, {} as never])).toEqual([
      { q: "" },
      { q: "" },
      { q: "", repregunta: undefined, hecha: undefined },
    ]);
  });
});

describe("contadores", () => {
  const ps = normalizarPreguntas([{ q: "a", hecha: "si" }, { q: "b" }, { q: "c", hecha: "no" }]);

  it("cuenta las marcadas del grupo", () => {
    expect(contarHechas(ps)).toEqual({ hechas: 1, total: 3 });
  });

  it("«sí» con tilde también cuenta (el vocabulario de isSi es tolerante)", () => {
    expect(contarHechas(normalizarPreguntas([{ q: "a", hecha: "sí" }]))).toEqual({ hechas: 1, total: 1 });
  });

  it("suma las marcas de todo el plan — es lo que se avisa antes de regenerar", () => {
    expect(
      contarMarcasDelPlan([
        { preguntas: [{ q: "a", hecha: "si" }, { q: "b" }] },
        { preguntas: ["string viejo, nunca marcado"] },
        { preguntas: [{ q: "c", hecha: "si" }] },
      ]),
    ).toBe(2);
  });

  it("un plan vacío o sin preguntas no avisa nada", () => {
    expect(contarMarcasDelPlan(null)).toBe(0);
    expect(contarMarcasDelPlan([{}, { preguntas: [] }])).toBe(0);
  });
});

describe("el agente no puede marcar una pregunta como preguntada", () => {
  // La invariante NO se sostiene con un pedido en el brief: se sostiene porque `hecha`
  // no está en el schema y `coerceToSchema` descarta todo lo que no esté ahí. Si alguien
  // agrega `hecha` al schema "para completar el tipo", este test lo frena.
  it("`hecha` NO está en el schema de una pregunta", () => {
    const def = EXPLORACION_SECTION_DEFS.find((d) => d.key === "sesiones");
    const props = (def?.schema as Record<string, never> | undefined) as unknown as {
      properties?: { sesiones?: { items?: { properties?: { preguntas?: { items?: { properties?: Record<string, unknown> } } } } } };
    };
    const campos = props?.properties?.sesiones?.items?.properties?.preguntas?.items?.properties ?? {};
    expect(Object.keys(campos).sort()).toEqual(["q", "repregunta"]);
  });
});

describe("⛔ regenerar NO borra las preguntas ya marcadas", () => {
  const previas = [
    { titulo: "Cómo venden hoy", preguntas: [{ q: "¿Cuántos procesos de venta tienen?", hecha: "si" }, { q: "¿Quién aprueba descuentos?" }] },
    { titulo: "Datos", preguntas: [{ q: "¿Dónde vive la base de clientes?", hecha: "si" }] },
  ];

  it("la que vuelve con otro tono (tildes, signos, mayúsculas) conserva su marca", () => {
    const nuevas = [{ titulo: "Cómo venden hoy", preguntas: [{ q: "¿cuantos procesos de venta tienen" }, { q: "Nueva" }] }];
    const r = conservarMarcas(previas, nuevas);
    expect(r[0].preguntas[0].hecha).toBe("si");
    expect(r[0].preguntas[1].hecha).toBeUndefined();
  });

  it("la marcada que el agente ya no trae vuelve a su sesión (por título)", () => {
    const nuevas = [
      { titulo: "Cómo venden hoy", preguntas: [{ q: "Otra" }] },
      { titulo: "Datos", preguntas: [{ q: "¿Hay duplicados?" }] },
    ];
    const r = conservarMarcas(previas, nuevas);
    expect(r[0].preguntas.map((p) => p.q)).toContain("¿Cuántos procesos de venta tienen?");
    expect(r[1].preguntas.map((p) => p.q)).toContain("¿Dónde vive la base de clientes?");
    expect(contarMarcasDelPlan(r)).toBe(2);
  });

  it("si el plan nuevo viene vacío, las marcadas no se pierden", () => {
    const r = conservarMarcas(previas, []);
    expect(contarMarcasDelPlan(r)).toBe(2);
  });

  it("las no marcadas no se arrastran (el agente decide el plan nuevo)", () => {
    const r = conservarMarcas(previas, [{ titulo: "X", preguntas: [] }]);
    expect(r.flatMap((s) => s.preguntas).some((p) => p.q === "¿Quién aprueba descuentos?")).toBe(false);
  });

  it("no muta lo que recibe", () => {
    const nuevas = [{ titulo: "Cómo venden hoy", preguntas: [{ q: "¿Cuántos procesos de venta tienen?" }] }];
    conservarMarcas(previas, nuevas);
    expect((nuevas[0].preguntas[0] as { hecha?: string }).hecha).toBeUndefined();
  });

  it("el generador la usa antes de escribir", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("lib/canvas/exploracion-generate.ts", "utf8");
    expect(src.indexOf("conservarMarcas(")).toBeGreaterThan(-1);
    expect(src.indexOf("conservarMarcas(")).toBeLessThan(src.indexOf("canvasBlock.deleteMany"));
  });
});

describe("cada sección de la exploración tiene SU botón (no «Agregar dolor»)", () => {
  it("ninguna sección usa el renderer de dolores del Diagnóstico", () => {
    expect(EXPLORACION_SECTION_DEFS.filter((d) => d.sectionType === "pain").map((d) => d.key)).toEqual([]);
  });
});
