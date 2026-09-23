/**
 * lib/sessions/session-project-locks.test.ts
 *
 * Matriz de LOCKS POR LINK del clasificador sesión→proyecto (plan "contexto por
 * proyecto"). El invariante que protege: NINGUNA señal humana sobre un link
 * (`manual` / `reviewedAt` / tombstone `included=false` / `handoffOverride`) puede
 * ser pisada ni borrada por la IA — la curación del CSE es DURABLE.
 *
 * Casos:
 *   A) Link virgen de IA (agent, sin revisar, incluido, sin override) → NO lockeado.
 *   B) Cada señal humana lockea POR SÍ SOLA (las 4, de a una).
 *   C) handoffOverride lockea con ambos valores (true y false — la "X" y el "Agregar").
 *   D) Combinaciones: cualquier par de señales sigue lockeando.
 *
 * Correr: `npx vitest run lib/sessions/session-project-locks.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isLockedLink, WHERE_VINCULO_VIRGEN, type SessionProjectLockFields } from "./session-project-locks";

/** Link virgen de IA: el ÚNICO estado que el clasificador puede modificar/borrar. */
function virginLink(overrides: Partial<SessionProjectLockFields> = {}): SessionProjectLockFields {
  return {
    source: "agent",
    reviewedAt: null,
    included: true,
    handoffOverride: null,
    timelineOverride: null,
    ...overrides,
  };
}

test("A — link virgen de IA NO está lockeado (la IA puede reconsiderarlo)", () => {
  expect(isLockedLink(virginLink())).toBe(false);
});

test("B — cada señal humana lockea por sí sola", () => {
  // source=manual: el humano creó/ratificó el vínculo
  expect(isLockedLink(virginLink({ source: "manual" }))).toBe(true);
  // reviewedAt: el humano confirmó el link (botón "Confirmar contexto" / toggle del panel)
  expect(isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10") }))).toBe(true);
  // included=false: tombstone — el humano excluyó ESTE proyecto para esta sesión
  expect(isLockedLink(virginLink({ included: false }))).toBe(true);
});

test("C — handoffOverride lockea con AMBOS valores (la 'X' y el 'Agregar' del panel)", () => {
  expect(isLockedLink(virginLink({ handoffOverride: true }))).toBe(true);
  expect(isLockedLink(virginLink({ handoffOverride: false }))).toBe(true);
});

test("D — combinaciones de señales siguen lockeando (ninguna 'des-lockea' a otra)", () => {
  expect(isLockedLink(virginLink({ source: "manual", included: false }))).toBe(true);
  expect(
    isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10"), handoffOverride: false })),
  ).toBe(true);
  // Tombstone re-incluido a mano (reviewedAt estampado, included=true): sigue lockeado
  // por el reviewedAt — la decisión humana de reincluir también es durable.
  expect(isLockedLink(virginLink({ reviewedAt: new Date("2026-07-10"), included: true }))).toBe(true);
});

test("E — el «Agregar» del cronograma lockea; la X NO (y así la reunión sigue clasificándose)", () => {
  /* 2026-09-23, tras la revisión adversarial. Con la X como candado, `reclassify` salteaba la
     reunión ENTERA (toda sesión con un vínculo lockeado se descarta): una semanal que el CSE sacó
     del cronograma de A nunca llegaba al proyecto B, y A quedaba fijo como primario. La X dice «no
     la uses para ESTE cronograma», no «esta reunión es de A». «Agregar» sí es sumar: lockea. */
  expect(isLockedLink(virginLink({ timelineOverride: true }))).toBe(true);
  expect(isLockedLink(virginLink({ timelineOverride: false }))).toBe(false);
});

/** Evaluador mínimo del where compartido, con la semántica de SQL para NULL. */
function coincideConVirgen(l: SessionProjectLockFields): boolean {
  const w = WHERE_VINCULO_VIRGEN;
  return (
    l.reviewedAt === w.reviewedAt &&
    l.included === w.included &&
    l.handoffOverride === w.handoffOverride &&
    w.OR.some((c) => c.timelineOverride === l.timelineOverride)
  );
}

test("F — el where del vínculo virgen es el negativo EXACTO del candado", () => {
  /* El deleteMany del clasificador borra lo que coincide con este where. Tiene que coincidir con
     `!isLockedLink` fila por fila (salvo `source`, que el llamador acota aparte): si una señal del
     candado falta acá, el clasificador borra vínculos que un humano tocó; si sobra, deja vivos
     vínculos que la IA ya no cree. */
  const casos: SessionProjectLockFields[] = [];
  for (const reviewedAt of [null, new Date("2026-07-10")])
    for (const included of [true, false])
      for (const handoffOverride of [null, true, false])
        for (const timelineOverride of [null, true, false])
          casos.push(virginLink({ reviewedAt, included, handoffOverride, timelineOverride }));
  for (const c of casos) {
    expect(coincideConVirgen(c), JSON.stringify(c)).toBe(!isLockedLink(c));
  }
  // ⛔ Y nunca con NOT: en SQL descartaría los NULL, que hoy son todas las filas.
  const src = fs.readFileSync(path.join(process.cwd(), "lib/sessions/session-project-locks.ts"), "utf8");
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  expect(codigo).not.toMatch(/NOT\s*:/);
});

test("G — el clasificador borra con el where compartido, no con literales a mano", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/sessions/classify-session-project.ts"), "utf8");
  const i = src.indexOf("sessionProject.deleteMany");
  expect(i, "no se encontró el borrado de vínculos").toBeGreaterThan(-1);
  const tramo = src.slice(i, src.indexOf("});", i));
  expect(tramo, "el borrado dejó de usar el where compartido").toContain("...WHERE_VINCULO_VIRGEN");
  expect(tramo, "volvieron los literales a mano").not.toMatch(/handoffOverride:\s*null/);
});
