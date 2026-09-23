import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { linkFeedsTimeline, type VinculoParaCronograma } from "./session-feeding";

/**
 * lib/timeline/session-feeding.test.ts — QUÉ REUNIONES LEE LA IA DEL CRONOGRAMA.
 *
 * La regla cambió el 2026-09-23 (segunda versión, pedido de Elías): ya no entran todas las reuniones
 * del proyecto con una X para sacar — entran SOLO las que el CSE eligió. El modo de falla silencioso
 * es volver a la regla vieja: la pantalla mostraría las elegidas y el agente leería las 61.
 */

const TABLA: Array<[VinculoParaCronograma, boolean, string]> = [
  [{ included: true, timelineOverride: true }, true, "la eligió el CSE"],
  [{ included: true, timelineOverride: null }, false, "del proyecto pero sin elegir: ya no entran todas"],
  [{ included: true, timelineOverride: false }, false, "la X de la primera versión vale como «no elegida»"],
  [{ included: false, timelineOverride: true }, false, "el tombstone manda aunque esté elegida"],
  [{ included: false, timelineOverride: null }, false, "tombstone: sacada del proyecto"],
  [{ included: false, timelineOverride: false }, false, "tombstone y X"],
];

describe("qué reuniones alimentan al cronograma", () => {
  it.each(TABLA)("%o → %s (%s)", (vinculo, esperado) => {
    expect(linkFeedsTimeline(vinculo)).toBe(esperado);
  });

  it("⛔ no es la regla del handoff: no importa su clasificador por título", () => {
    /* La regla del handoff descarta las reuniones de implementación, las semanales y las de
       revisión — justo las que describen fases y tareas. */
    const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/session-feeding.ts"), "utf8");
    expect(src).not.toMatch(/import[^;]*session-relevance/);
  });
});
