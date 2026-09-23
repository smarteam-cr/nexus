import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOPE_NOTAS_CRONOGRAMA,
  bloqueDeNotasDelCronograma,
  bloqueDeReunionesDelCronograma,
  notasPasanElTope,
  type ReunionParaElCronograma,
} from "./material-cronograma";

/**
 * lib/contexto/material-cronograma.test.ts — EL MATERIAL DEL «CONTEXTO DEL CRONOGRAMA».
 *
 * Tres cosas que, si se rompen, no fallan en ningún lado:
 *  · un bloque vacío que igual lleva rótulo — el prompt de un proyecto sin material deja de ser
 *    idéntico al de antes y el modelo cree que le falta algo;
 *  · la FRONTERA fuera del rótulo — las transcripciones son internas y los títulos de tarea los lee
 *    el cliente;
 *  · un tope que la pantalla y el servidor cuentan distinto — el CSE cree que el agente leyó una
 *    nota que se cortó.
 */

const R = (over: Partial<ReunionParaElCronograma> = {}): ReunionParaElCronograma => ({
  title: "Semanal de implementación",
  date: Date.UTC(2026, 8, 10),
  prefijoDeSala: "[CON EL CLIENTE] ",
  contenido: "Se acordó mover la migración a la fase 3.",
  ...over,
});

describe("las reuniones", () => {
  it("sin reuniones con contenido, el bloque es VACÍO — sin rótulo huérfano", () => {
    expect(bloqueDeReunionesDelCronograma([])).toBe("");
    expect(bloqueDeReunionesDelCronograma([R({ contenido: null }), R({ contenido: "   " })])).toBe("");
  });

  it("lleva rótulo, la sala y la fecha de cada reunión", () => {
    const b = bloqueDeReunionesDelCronograma([R()]);
    expect(b.startsWith("=== ")).toBe(true);
    expect(b).toContain("[CON EL CLIENTE] Semanal de implementación");
    expect(b).toContain("Se acordó mover la migración a la fase 3.");
  });

  it("⭐ la FRONTERA viaja adentro del rótulo", () => {
    /* Los tres agentes que leen esto la reciben igual sin re-sembrar ningún prompt. */
    const b = bloqueDeReunionesDelCronograma([R()]);
    expect(b).toContain("material INTERNO");
    expect(b).toContain("NUNCA copies a un título de tarea");
  });

  it("el rótulo dice que las ELIGIÓ el CSE — todas, sin marca por reunión", () => {
    /* Desde el 2026-09-23 el cronograma lee SOLO lo elegido: una marca «agregada a mano» por
       reunión quedaría en todas y dejaría de decir algo. */
    const b = bloqueDeReunionesDelCronograma([R(), R({ title: "Otra" })]);
    expect(b.split("\n")[0]).toContain("QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA");
    expect(b).not.toContain("a mano");
  });
});

describe("las notas", () => {
  it("sin notas, el bloque es VACÍO", () => {
    expect(bloqueDeNotasDelCronograma([])).toBe("");
    expect(bloqueDeNotasDelCronograma([{ title: "x", content: "  " }])).toBe("");
  });

  it("lleva rótulo, título y la frontera", () => {
    const b = bloqueDeNotasDelCronograma([{ title: "Cambio de prioridad", content: "Primero Service." }]);
    expect(b.startsWith("=== ")).toBe(true);
    expect(b).toContain("### Nota: Cambio de prioridad");
    expect(b).toContain("NUNCA copies a un título de tarea");
  });

  it("se recortan al tope TOTAL, y la pantalla avisa con el MISMO número", () => {
    const largas = [{ title: null, content: "x".repeat(TOPE_NOTAS_CRONOGRAMA + 500) }];
    const b = bloqueDeNotasDelCronograma(largas);
    const cuerpo = b.slice(b.indexOf("### Nota"));
    expect(cuerpo.length).toBeLessThanOrEqual(TOPE_NOTAS_CRONOGRAMA);
    expect(notasPasanElTope(largas)).toBe(true);
    expect(notasPasanElTope([{ title: "a", content: "corta" }])).toBe(false);
  });

  it("la pantalla y la ruta importan la MISMA constante, no un número escrito a mano", () => {
    /* Si alguien escribe 12000 a mano en el componente, el día que cambie el tope la pantalla
       avisa tarde (o nunca) y el CSE cree que el agente leyó lo que se cortó. */
    const raiz = process.cwd();
    for (const rel of [
      "components/canvas/CronogramaContextSection.tsx",
      "app/api/projects/[projectId]/timeline/sources/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(raiz, rel), "utf8");
      expect(src, `${rel} no usa la constante del tope`).toContain("TOPE_NOTAS_CRONOGRAMA");
      expect(src, `${rel} tiene el tope escrito a mano`).not.toMatch(/12[_.]?000/);
    }
  });
});
