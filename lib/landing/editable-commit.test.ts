/**
 * lib/landing/editable-commit.test.ts — GUARD: el campo editable no comitea sin cambios.
 *
 * Lo encontró la auditoría previa al push, y era pérdida de datos silenciosa.
 *
 * `Editable` comiteaba en CADA blur, hubiera cambiado el texto o no. Eso fue inocuo
 * mientras todos los campos leyeran y escribieran la MISMA clave: entrar y salir sin
 * tipear guardaba el mismo valor, un no-op.
 *
 * Dejó de serlo cuando la portada empezó a mostrar un valor DERIVADO y a escribir en otra
 * clave: la bajada muestra el titular solo cuando NO subió a título, pero siempre escribe
 * en `headline`. Con un documento sin título propio la bajada se ve vacía — y un clic
 * adentro y otro afuera, sin tipear una letra, guardaba "" sobre el titular del documento
 * y lo destruía. Sin deshacer, en las seis portadas, incluidas las que ve el cliente y el
 * requerimiento técnico que el dev externo lee EN VIVO.
 *
 * El test es de lectura de código porque el componente necesita DOM y el proyecto "unit"
 * corre sin él (mismo molde que los otros candados del repo). Lo que congela es la regla,
 * no el detalle: si alguien vuelve a comitear incondicionalmente, esto falla y explica por qué.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const INLINE = fs.readFileSync(path.join(process.cwd(), "components/landing/inline.tsx"), "utf8");

describe("🔒 el campo editable solo comitea si el texto cambió", () => {
  it("el blur compara antes de comitear", () => {
    // La forma exacta puede cambiar; lo que no puede es comitear sin comparar.
    const blur = INLINE.slice(INLINE.indexOf("onBlur="), INLINE.indexOf("onBlur=") + 400);
    expect(blur, "no se encontró el manejador de blur").toBeTruthy();
    expect(
      /if\s*\(\s*txt\s*!==\s*safeValue\s*\)/.test(blur),
      "el blur volvió a comitear sin comparar: un clic sin escribir puede borrar el campo " +
        "que la sección esté escribiendo (ver la cabecera de este archivo)",
    ).toBe(true);
  });

  it("el commit al desmontar también compara", () => {
    expect(
      INLINE.includes("txt !== valueRef.current"),
      "el commit al desmontar dejó de comparar contra el valor vigente",
    ).toBe(true);
  });
});

describe("🔒 las portadas fijan el título al escribir la bajada", () => {
  const PORTADAS = [
    "components/landing/sections.tsx",
    "components/canvas/desarrollo-sections/DesarrolloSections.tsx",
    "components/canvas/kickoff-sections/KickoffSections.tsx",
  ];

  for (const f of PORTADAS) {
    it(`${f.split("/").pop()}: escribir la bajada no deja el título al azar`, () => {
      // Sin fijarlo, el texto recién escrito como bajada salta al título en el siguiente
      // render (el titular se vuelve a promocionar cuando no hay título propio).
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(
        src.includes("set({ titulo, headline: v })"),
        "la bajada volvió a escribir solo el titular: al guardarla, el texto salta al título",
      ).toBe(true);
    });
  }
});

describe("🔒 el conocimiento se mide por CANTIDAD, no por si trae texto", () => {
  it("el Diagnóstico decide la escala por count, no por text", () => {
    // loadKnowledgeByTags devuelve texto aunque NINGÚN documento haya entrado en el
    // presupuesto (la nota de "no entraron"). Preguntar por `text` toma esa nota como
    // escala válida y el respaldo no se usa nunca.
    const src = fs.readFileSync(path.join(process.cwd(), "lib/canvas/diagnostico-generate.ts"), "utf8");
    expect(
      src.includes("escala.count > 0"),
      "el Diagnóstico volvió a decidir por `escala.text`: puede puntuar al cliente sin la vara",
    ).toBe(true);
  });

  it("Implementación sigue usando el mismo criterio", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/canvas/implementacion-generate.ts"), "utf8");
    expect(src.includes("breeze.count > 0")).toBe(true);
  });
});
