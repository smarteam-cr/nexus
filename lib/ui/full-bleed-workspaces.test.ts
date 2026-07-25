/**
 * components/clients/full-bleed-workspaces.test.ts — GUARD: los canvas del motor de
 * landings se montan a sangre.
 *
 * El panel del proyecto envuelve su contenido en `px-6 py-8`, que es lo correcto para
 * una grilla de bloques. Pero los canvas del motor de landings pintan bandas con fondo
 * propio (el hero y el cierre del Diagnóstico son oscuros): dentro de ese padding, la
 * banda queda recortada y se ven calles a los lados. Por eso cada uno se monta dentro de
 * un div con margen negativo que anula el padding del panel.
 *
 * Kickoff, Desarrollo y Exploración lo tenían desde siempre; Diagnóstico, Planificación
 * e Implementación nacieron sin él y el defecto pasó tres revisiones sin que nadie lo
 * viera, porque solo se nota con el canvas generado y en la pieza que se le proyecta al
 * cliente. Este guard existe para que la próxima pieza del motor no repita el olvido.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PANEL = path.join(process.cwd(), "components/clients/ProjectCanvasPanel.tsx");
const SRC = fs.readFileSync(PANEL, "utf8");

/** El margen que anula el `px-6 py-8` del panel. */
const A_SANGRE = 'margin: "1.5rem -1.5rem -2rem"';

/** Workspaces que renderizan con el motor de landings (los que llevan bandas). */
const DEL_MOTOR = [
  "KickoffWorkspace",
  "DesarrolloWorkspace",
  "ExploracionWorkspace",
  "DiagnosticoWorkspace",
  "PlanificacionWorkspace",
  "ImplementacionWorkspace",
];

describe("los canvas del motor de landings se montan a sangre", () => {
  for (const componente of DEL_MOTOR) {
    it(`${componente} está dentro del div que anula el padding del panel`, () => {
      const montaje = SRC.indexOf(`<${componente}`);
      expect(montaje, `${componente} ya no se monta en el panel`).toBeGreaterThan(-1);

      // El wrapper abre pocas líneas antes (título del bloque + CanvasBoundary en medio).
      const antes = SRC.slice(Math.max(0, montaje - 700), montaje);
      expect(
        antes.includes(A_SANGRE),
        `${componente} se monta sin el margen negativo: sus bandas van a quedar ` +
          `recortadas con calles a los lados. Envolvelo en ` +
          `<div style={{ ${A_SANGRE} }}> como los demás.`,
      ).toBe(true);
    });
  }

  it("el Cronograma NO va a sangre (no usa el motor: es el Gantt)", () => {
    const montaje = SRC.indexOf("<ProjectTimelineCanvas");
    if (montaje === -1) return; // renombrado: lo cubre el test de arriba si migra al motor
    const antes = SRC.slice(Math.max(0, montaje - 400), montaje);
    expect(antes.includes(A_SANGRE)).toBe(false);
  });
});
