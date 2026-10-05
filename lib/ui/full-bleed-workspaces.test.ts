/**
 * lib/ui/full-bleed-workspaces.test.ts — GUARD: los canvas del motor de landings se montan en
 * el MARCO del documento, sin padding.
 *
 * Los canvas del motor pintan bandas con fondo propio (el hero y el cierre del Diagnóstico son
 * oscuros): dentro de un padding, la banda queda recortada y se ven calles a los lados. Hasta el
 * 2026-10-04 cada uno se montaba a sangre con un margen negativo; desde el rediseño de la ficha va
 * dentro de `MarcoDelDocumento` («El documento · así lo ve el cliente»), una tarjeta SIN padding
 * con las esquinas recortadas — las bandas llegan a sus bordes.
 *
 * Diagnóstico, Planificación e Implementación nacieron una vez sin el envoltorio y el defecto pasó
 * tres revisiones sin que nadie lo viera. Este guard existe para que la próxima pieza del motor no
 * repita el olvido, y para que el marco no gane un padding.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PANEL = path.join(process.cwd(), "components/clients/ProjectCanvasPanel.tsx");
const SRC = fs.readFileSync(PANEL, "utf8");
const MARCO = fs.readFileSync(path.join(process.cwd(), "components/clients/MarcoDelDocumento.tsx"), "utf8");

/** El marco del documento: una tarjeta sin padding (las bandas llegan a los bordes). */
const EN_EL_MARCO = "<MarcoDelDocumento";

/** Workspaces que renderizan con el motor de landings (los que llevan bandas). */
const DEL_MOTOR = [
  "KickoffWorkspace",
  "DesarrolloWorkspace",
  "ExploracionWorkspace",
  "DiagnosticoWorkspace",
  "PlanificacionWorkspace",
  "ImplementacionWorkspace",
];

describe("los canvas del motor de landings se montan en el marco del documento", () => {
  for (const componente of DEL_MOTOR) {
    it(`${componente} está dentro del marco del documento`, () => {
      const montaje = SRC.indexOf(`<${componente}`);
      expect(montaje, `${componente} ya no se monta en el panel`).toBeGreaterThan(-1);

      // El wrapper abre pocas líneas antes (título del bloque + CanvasBoundary en medio).
      const antes = SRC.slice(Math.max(0, montaje - 700), montaje);
      expect(
        antes.includes(EN_EL_MARCO),
        `${componente} se monta fuera del marco del documento. Envuélvelo en ` +
          `<MarcoDelDocumento> como los demás.`,
      ).toBe(true);
    });
  }

  it("el marco NO tiene padding alrededor del documento (las bandas van a los bordes)", () => {
    const tarjeta = MARCO.slice(MARCO.indexOf("<section"), MARCO.indexOf(">", MARCO.indexOf("<section")));
    expect(tarjeta, "no encontré la tarjeta del marco").toContain("overflow-clip");
    /* `overflow-hidden` crea un contenedor de scroll: las barras sticky de los documentos dejarían
       de quedarse arriba. `clip` recorta igual sin crearlo. */
    expect(tarjeta, "el marco volvió a overflow-hidden: rompe las barras sticky").not.toContain("overflow-hidden");
    expect(tarjeta, "el marco ganó un padding: las bandas del motor van a quedar recortadas").not.toMatch(/\bp[xy]?-\d/);
  });

  it("el Cronograma NO va en el marco (no usa el motor: es el Gantt)", () => {
    const montaje = SRC.indexOf("<CronogramaCanvas");
    expect(montaje, "el cronograma ya no se monta en el panel").toBeGreaterThan(-1);
    const antes = SRC.slice(Math.max(0, montaje - 400), montaje);
    expect(antes.includes(EN_EL_MARCO)).toBe(false);
  });
});
