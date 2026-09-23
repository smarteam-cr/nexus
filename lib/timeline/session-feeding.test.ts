import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { linkFeedsTimeline, whereAlimentaCronograma, type VinculoParaCronograma } from "./session-feeding";

/**
 * lib/timeline/session-feeding.test.ts — LA REGLA Y SU GEMELO NO PUEDEN SEPARARSE.
 *
 * La regla existe dos veces a propósito: en memoria (`linkFeedsTimeline`) y como `where` de Prisma
 * (`whereAlimentaCronograma`). Si divergen, la pantalla dice que una reunión alimenta y el agente
 * no la lee — o al revés — sin un solo error. El modo de falla más probable es el gemelo escrito
 * como `NOT: { timelineOverride: false }`, que en SQL descarta las filas NULL: hoy son TODAS.
 */

/** Evaluador mínimo del `where`, con la semántica de SQL para NULL. */
function evaluarWhere(where: ReturnType<typeof whereAlimentaCronograma>, v: VinculoParaCronograma): boolean {
  if (where.included !== v.included) return false;
  return where.OR.some((cond) => cond.timelineOverride === v.timelineOverride);
}

const TABLA: Array<[VinculoParaCronograma, boolean, string]> = [
  [{ included: true, timelineOverride: null }, true, "la regla: toda reunión del proyecto alimenta"],
  [{ included: true, timelineOverride: true }, true, "agregada a mano"],
  [{ included: true, timelineOverride: false }, false, "la X del CSE, solo para el cronograma"],
  [{ included: false, timelineOverride: null }, false, "tombstone: sacada del proyecto"],
  [{ included: false, timelineOverride: true }, false, "el tombstone manda aunque la hayan agregado"],
  [{ included: false, timelineOverride: false }, false, "tombstone y X"],
];

describe("qué reuniones alimentan al cronograma", () => {
  it.each(TABLA)("%o → %s (%s)", (vinculo, esperado) => {
    expect(linkFeedsTimeline(vinculo)).toBe(esperado);
  });

  it("⭐ el gemelo de Prisma da LO MISMO que la regla en memoria, fila por fila", () => {
    for (const [vinculo, esperado, motivo] of TABLA) {
      expect(evaluarWhere(whereAlimentaCronograma(), vinculo), motivo).toBe(esperado);
    }
  });

  it("⛔ el gemelo nunca se escribe con NOT (descartaría las filas NULL, que hoy son todas)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/session-feeding.ts"), "utf8");
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(codigo).not.toMatch(/NOT\s*:/);
    expect(codigo).not.toMatch(/not\s*:\s*false/);
    expect(codigo, "el gemelo tiene que aceptar explícitamente el NULL").toContain(
      "{ timelineOverride: null }",
    );
  });

  it("⛔ no es la regla del handoff: no importa su clasificador por título", () => {
    /* La regla del handoff descarta las reuniones de implementación, las semanales y las de
       revisión — justo las que describen fases y tareas. */
    const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/session-feeding.ts"), "utf8");
    expect(src).not.toMatch(/import[^;]*session-relevance/);
  });
});
