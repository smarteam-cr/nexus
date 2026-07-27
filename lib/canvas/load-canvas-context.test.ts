/**
 * lib/canvas/load-canvas-context.test.ts
 *
 * `flattenCardData` es el embudo por el que un canvas se convierte en el CONTEXTO que lee
 * otro agente. Lo que se cae acá se cae en silencio: el resultado sigue siendo un string
 * válido, solo que más pobre, así que ni los tipos ni el build ni la pantalla lo notan.
 *
 * Pasó de verdad: las preguntas del plan de sesiones vivían en un array DENTRO de cada
 * sesión, y el filtro de `rest` exigía `typeof v === "string"` — se perdían enteras. Medido
 * sobre Wherex, el contexto de Exploración que leían Diagnóstico y Planificación pasó de
 * 13.750 a 16.492 caracteres al arreglarlo, con la sección del plan de 1.584 a 4.326.
 */
import { describe, it, expect } from "vitest";
import { flattenCardData } from "./load-canvas-context";

/** El shape real de la sección `sesiones` de Exploración (formato nuevo). */
const PLAN = {
  intro: "Tres sesiones ordenadas por dependencia.",
  sesiones: [
    {
      orden: "2",
      titulo: "Cómo venden hoy",
      objetivo: "Confirmar si hay uno o varios procesos de venta",
      participantes: "Gerente comercial + un vendedor senior",
      preguntas: [
        { q: "¿Por dónde entró el último negocio que cerraron?", repregunta: "Si contesta el ideal: pedile el caso real.", hecha: "si" },
        { q: "¿Quedó algún tipo de venta fuera del pipeline?", repregunta: "" },
      ],
    },
  ],
};

describe("flattenCardData: las preguntas del plan de sesiones llegan al agente", () => {
  const out = flattenCardData(PLAN);

  it("cada pregunta aparece con su texto completo", () => {
    expect(out).toContain("¿Por dónde entró el último negocio que cerraron?");
    expect(out).toContain("¿Quedó algún tipo de venta fuera del pipeline?");
  });

  it("la repregunta también — es la mitad del valor de la sección", () => {
    expect(out).toContain("Si contesta el ideal: pedile el caso real.");
  });

  // Las dos ausencias (`hecha`, `orden`) se prueban con la LÍNEA ENTERA, no buscando la
  // palabra suelta: "si" y "orden" aparecen en castellano corriente dentro del propio
  // contenido ("Confirmar SI hay…", "sesiones ORDENadas…") y un `not.toContain` daría un
  // falso positivo. Si el campo se colara, aparecería como un ` · valor` extra al final.
  it("la casilla del CSE NO llega al prompt", () => {
    expect(out).toContain(
      "- ¿Por dónde entró el último negocio que cerraron? — Si contesta el ideal: pedile el caso real.",
    );
  });

  it("el `orden` viejo de la IA tampoco: el orden real es el del array", () => {
    // La UI ya decidió numerar por posición porque el `orden` queda viejo al reordenar.
    // Imprimirlo acá solo puede contradecir el orden en que el agente lee las sesiones.
    // La línea completa también prueba lo otro: el título ENCABEZA, antes del "—".
    // El schema usa `titulo`, no `title`; sin agregarlo a la lista, "título — detalle"
    // se degradaba a un `·` más en el medio de la línea.
    expect(out).toContain(
      "- Cómo venden hoy — Confirmar si hay uno o varios procesos de venta · Gerente comercial + un vendedor senior",
    );
  });
});

describe("flattenCardData: lo que ya andaba sigue andando", () => {
  it("el formato viejo (`preguntas: string[]`) se aplana igual", () => {
    const out = flattenCardData({ sesiones: [{ titulo: "Vieja", preguntas: ["¿Pregunta suelta?"] }] });
    expect(out).toContain("- Vieja");
    expect(out).toContain("¿Pregunta suelta?");
  });

  it("el shape `{title, detail}` de las demás secciones no cambia", () => {
    const out = flattenCardData({ items: [{ title: "Facturan en Odoo", detail: "Handoff · ¿Qué vendimos?" }] });
    expect(out).toBe("- Facturan en Odoo — Handoff · ¿Qué vendimos?");
  });

  it("las claves técnicas se siguen salteando y la data basura no rompe", () => {
    expect(flattenCardData({ __lang: "es", diagram: { nodes: [] }, ok: "sí" })).toBe("ok: sí");
    expect(flattenCardData({ items: [null, 42, ""] as never })).toBe("");
  });

  it("el tope de profundidad sigue vigente (no se recorre un JSON infinito)", () => {
    const hondo = { a: [{ titulo: "n1", b: [{ titulo: "n2", c: [{ titulo: "n3", d: [{ titulo: "n4" }] }] }] }] };
    const out = flattenCardData(hondo);
    expect(out).toContain("n1");
    expect(out).toContain("n2");
    expect(out).not.toContain("n4");
  });
});
