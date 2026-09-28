/**
 * lib/escala/guia.test.ts — la vista «Guía» muestra los documentos tal cual, menos lo que se
 * recorre en otra parte (la matriz) y el encabezado técnico.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { indiceDe, prepararDocumento } from "./guia";

const DOC = ["---", "version: 9.9.9", "---", "", "# Parte 1", "", "Uno.", "", "# Parte 3 — La matriz", "", "## Área 1", "", "- Criterio.", "", "# Parte 4 — Referencia", "", "## Glosario", "", "Fin."].join("\n");

describe("prepararDocumento", () => {
  it("saca el encabezado y deja la Parte 3 como una nota que manda a las otras vistas", () => {
    const md = prepararDocumento(DOC, "escala");
    expect(md.startsWith("# Parte 1")).toBe(true);
    expect(md).not.toContain("version: 9.9.9");
    expect(md).toContain("# Parte 3 — La matriz");
    expect(md).not.toContain("## Área 1");
    expect(md).not.toContain("- Criterio.");
    expect(md).toMatch(/> La matriz .*Matriz.*Por dimensión.*Mapa/);
    expect(md).toContain("# Parte 4 — Referencia\n\n## Glosario\n\nFin.");
  });

  it("la especificación y el manual van enteros (no tienen matriz que recortar)", () => {
    const md = prepararDocumento(DOC, "manual");
    expect(md).toContain("## Área 1");
    expect(md.startsWith("# Parte 1")).toBe(true);
  });

  it("con CRLF da lo mismo", () => {
    expect(prepararDocumento(DOC.replace(/\n/g, "\r\n"), "escala")).toBe(prepararDocumento(DOC, "escala"));
  });

  it("el archivo real: sin la matriz, pero con todo lo demás", () => {
    const texto = leerArchivoDeLaEscala("escala");
    const md = prepararDocumento(texto, "escala");
    expect(md).not.toMatch(/`\[\d+\.\d+\.[DIFEO]\d+ · /);
    for (const titulo of ["## El perfil de negocio", "## Regla de asignación", "## Glosario", "## Historial de versiones"]) {
      expect(md, titulo).toContain(titulo);
    }
    expect(md.length).toBeLessThan(texto.length / 2);
  });
});

describe("indiceDe", () => {
  it("los encabezados de primer y segundo nivel, con el id que lleva cada uno en la página", () => {
    expect(indiceDe(prepararDocumento(DOC, "escala"))).toEqual([
      { nivel: 1, texto: "Parte 1", id: "parte-1" },
      { nivel: 1, texto: "Parte 3 — La matriz", id: "parte-3-la-matriz" },
      { nivel: 1, texto: "Parte 4 — Referencia", id: "parte-4-referencia" },
      { nivel: 2, texto: "Glosario", id: "glosario" },
    ]);
  });
});
