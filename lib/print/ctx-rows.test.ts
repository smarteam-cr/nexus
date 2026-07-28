/**
 * lib/print/ctx-rows.test.ts — el cargador y el motor tienen que decir LO MISMO.
 *
 * Una sección ctx-driven se decide dos veces: el cargador decide si le inyecta una fila
 * (`filasCtxFaltantes` + los canales) y el motor decide si la pinta (`ctxEmpty` de su
 * definición). Si divergen, pasa lo peor de los dos mundos:
 *
 *   · cargador dice "hay" / motor dice "no hay" → el documento pasa el 409 y sale un PDF de
 *     una hoja en blanco. Sin error, sin log, y con el aviso de descarga exitosa;
 *   · cargador dice "no hay" / motor dice "hay" → 409 sobre un documento que tenía contenido.
 *
 * Por eso las dos se cruzan acá sobre los MISMOS datos, en vez de testear cada una sola.
 */
import { describe, expect, it } from "vitest";
import { filasCtxFaltantes } from "./ctx-rows";
import { CRONOGRAMA_SECTION_DEFS } from "@/components/landing/configs/cronograma.defs";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { printDocType } from "./doc-types";
import type { LandingContext } from "@/components/landing/types";

const fase = { id: "f1", name: "Descubrimiento", order: 0, durationWeeks: 2 };

/** Los tres estados en los que puede estar un cronograma. */
const ESCENARIOS = [
  { nombre: "sin ProjectTimeline", timeline: null, hayContenido: false },
  { nombre: "con timeline pero sin fases", timeline: { exists: true, phases: [] }, hayContenido: false },
  { nombre: "con fases", timeline: { exists: true, phases: [fase] }, hayContenido: true },
] as const;

describe("filasCtxFaltantes", () => {
  it("inyecta solo las declaradas, ausentes, y con canal lleno", () => {
    expect(filasCtxFaltantes(["cronograma", "procesos"], [], { cronograma: true, procesos: true }))
      .toEqual(["cronograma", "procesos"]);
    // Ya presente como CanvasSection real → no se duplica.
    expect(filasCtxFaltantes(["cronograma"], ["cronograma"], { cronograma: true })).toEqual([]);
    // Canal vacío → no se inyecta, y por eso `rows: []` sigue significando "nada que imprimir".
    expect(filasCtxFaltantes(["cronograma"], [], { cronograma: false })).toEqual([]);
    // Canal no declarado = no hay contenido (no `undefined` interpretado como sí).
    expect(filasCtxFaltantes(["cronograma"], [], {})).toEqual([]);
    // Un tipo sin secciones ctx-driven no inyecta nada.
    expect(filasCtxFaltantes(undefined, [], { cronograma: true })).toEqual([]);
  });

  it("respeta el orden declarado en el registro", () => {
    expect(filasCtxFaltantes(["procesos", "cronograma"], [], { cronograma: true, procesos: true }))
      .toEqual(["procesos", "cronograma"]);
  });
});

describe("el canal del cargador y el `ctxEmpty` del motor coinciden", () => {
  const defCronograma = CRONOGRAMA_SECTION_DEFS.find((d) => d.key === "cronograma")!;
  const defKickoff = KICKOFF_SECTION_DEFS.find((d) => d.key === "cronograma")!;

  for (const esc of ESCENARIOS) {
    it(`documento Cronograma, ${esc.nombre}`, () => {
      const ctx = { cronograma: { timeline: esc.timeline } } as unknown as LandingContext;
      // El canal, tal como lo calcula `lib/print/load-doc.ts`.
      const canal = (esc.timeline?.phases.length ?? 0) > 0;
      expect(canal).toBe(esc.hayContenido);
      expect(defCronograma.ctxEmpty?.(ctx)).toBe(!esc.hayContenido);
    });

    it(`kickoff embebido, ${esc.nombre}`, () => {
      const ctx = { kickoff: { timeline: esc.timeline } } as unknown as LandingContext;
      const canal = (esc.timeline?.phases.length ?? 0) > 0;
      expect(canal).toBe(esc.hayContenido);
      expect(defKickoff.ctxEmpty?.(ctx)).toBe(!esc.hayContenido);
    });
  }

  it("cada sección ctx-driven del registro existe como def y es ctxDriven", () => {
    /* Anti-drift: declarar una key en `ctxSections` que ninguna def reconoce inyectaría una
       fila que el motor descarta — otra vez la hoja en blanco, por otro camino. */
    const defsPorTipo: Record<string, typeof CRONOGRAMA_SECTION_DEFS> = {
      timeline: CRONOGRAMA_SECTION_DEFS,
      kickoff: KICKOFF_SECTION_DEFS,
    };
    for (const [id, defs] of Object.entries(defsPorTipo)) {
      const tipo = printDocType(id);
      expect(tipo, `${id} no resuelve en el registro`).not.toBeNull();
      for (const key of tipo!.ctxSections ?? []) {
        const def = defs.find((d) => d.key === key);
        expect(def, `${id} declara ctxSections "${key}" y no hay def con esa key`).toBeTruthy();
        expect(def!.ctxDriven, `${id}.${key} tiene que ser ctxDriven`).toBe(true);
      }
    }
  });
});
