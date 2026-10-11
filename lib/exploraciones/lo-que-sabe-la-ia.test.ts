import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { tarjetasDeLoQueSabeLaIA } from "./lo-que-sabe-la-ia";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";

/**
 * lib/exploraciones/lo-que-sabe-la-ia.test.ts — «Lo que la IA ya sabe» en la página de inicio de la exploración: son
 * conteos en palabras, y la página los muestra (GLOSSARY «Página de inicio de la exploración»).
 */

describe("las tarjetas de «Lo que la IA ya sabe»", () => {
  it("en un proyecto: la ficha, el handoff congelado (y cómo) y las reuniones con minuta", () => {
    const t = tarjetasDeLoQueSabeLaIA(
      {
        ficha: { confirmados: 4, propuestos: 3 },
        propuestosPorOrigen: { Preventa: 2, Sesiones: 1 },
        handoff: true,
        handoffCongeladoAt: "2026-09-02T18:00:00.000Z",
        handoffVia: "cronograma",
        reunionesConMinuta: 5,
        preventa: { fecha: "2026-08-01T00:00:00.000Z", archivada: true },
      },
      { enUnProyecto: true },
    );
    expect(t.map((x) => x.clave)).toEqual(["ficha", "handoff", "reuniones"]);
    expect(t[0]).toMatchObject({ valor: "4 datos confirmados", detalle: "3 propuestos sin revisar (2 de la preventa, 1 de las reuniones). Suma lo aprendido en la preventa (archivada)." });
    expect(t[1]).toMatchObject({ valor: "Congelado el 2 sep 2026", detalle: "Al aplicar el cronograma. Lo nuevo llega como sugerencias." });
    expect(t[2]).toMatchObject({ valor: "5 con minuta" });
  });

  it("sin nada todavía, lo dice", () => {
    const t = tarjetasDeLoQueSabeLaIA({ ficha: { confirmados: 0, propuestos: 0 }, handoff: false, reunionesConMinuta: 0 }, { enUnProyecto: true });
    expect(t.map((x) => x.valor)).toEqual(["Nada confirmado todavía", "Sin handoff todavía", "Ninguna con minuta todavía"]);
  });

  it("en una preventa: la ficha y el test (como hipótesis)", () => {
    const t = tarjetasDeLoQueSabeLaIA({ ficha: { confirmados: 1, propuestos: 0 }, test: true }, { enUnProyecto: false });
    expect(t.map((x) => x.clave)).toEqual(["ficha", "test"]);
    expect(t[0].valor).toBe("1 dato confirmado");
    expect(t[1].detalle).toContain("hipótesis");
  });

  it("los textos van en tuteo", () => {
    const todas = [
      ...tarjetasDeLoQueSabeLaIA({ ficha: { confirmados: 2, propuestos: 1 }, handoff: true, reunionesConMinuta: 1 }, { enUnProyecto: true }),
      ...tarjetasDeLoQueSabeLaIA({ ficha: { confirmados: 0, propuestos: 0 }, test: true }, { enUnProyecto: false }),
    ];
    for (const x of todas) expect(voseoEnProsa(`${x.titulo} ${x.valor} ${x.detalle ?? ""}`), x.clave).toEqual([]);
  });

  it("la página de inicio las muestra (no queda calculado sin usar)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/exploraciones/InicioDeLaExploracion.tsx"), "utf8");
    expect(src).toContain("tarjetasDeLoQueSabeLaIA(");
    expect(src).not.toMatch(/hoy no se muestra/);
  });
});
