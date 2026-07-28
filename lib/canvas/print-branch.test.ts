/**
 * lib/canvas/print-branch.test.ts — la página de impresión no vuelve a ramificar por `isDefault`.
 *
 * ── EL BUG QUE CONGELA ───────────────────────────────────────────────────────
 * `/print/canvas/**` tiene dos fuentes de contenido: el pseudo-canvas «Resumen», cuyas
 * tarjetas son `ClientContextCard` con `canvasId: null` (no cuelgan de NINGÚN canvas), y
 * cualquier canvas real, cuyo contenido vive en `CanvasSection`/`CanvasBlock`.
 *
 * La página elegía la rama con `if (canvas.isDefault)`. Pero `isDefault` marca otra cosa:
 * el ANCLA del proyecto, que es el canvas de KICKOFF (lib/canvas/canvas-defs.ts). Entonces
 * el PDF del kickoff se iba a buscar su contenido a una tabla donde no tiene ni una fila y
 * salía con el encabezado correcto y el cuerpo vacío — "Este canvas aún no tiene contenido
 * para exportar" — que es la firma exacta de esa rama.
 *
 * Bug hermano del mismo flag: `canvasId="default"` hacía `findFirst({isDefault:true})` y
 * devolvía el Kickoff, así que el PDF del «Resumen» salía titulado "Kickoff".
 *
 * La lección ya estaba escrita en `components/clients/ProjectCanvasPanel.tsx` ("el render se
 * ramifica por NOMBRE, no por isDefault") y no había llegado hasta acá. Este test la trae.
 *
 * fs-scan, como el resto de las guardas de este repo (no hay tests de componentes: el
 * project `unit` de vitest solo corre lib/**).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PAGE = path.join(
  process.cwd(), "app", "print", "canvas", "[clientId]", "[canvasId]", "page.tsx",
);
const SRC = fs.readFileSync(PAGE, "utf8");

describe("la rama de carga se decide por IDENTIDAD, no por `isDefault`", () => {
  it("no existe ningún `if (canvas.isDefault)` como condición de rama", () => {
    // Se permite LEER el flag (viaja al print data para el encabezado); lo prohibido es
    // usarlo para decidir de dónde sale el contenido.
    expect(SRC).not.toMatch(/if\s*\(\s*canvas\.isDefault\s*\)/);
  });

  it("la rama de tarjetas se elige por el id del pseudo-canvas", () => {
    expect(SRC).toMatch(/if\s*\(\s*canvas\.id\s*===\s*PSEUDO_DEFAULT_ID\s*\)/);
    expect(SRC).toMatch(/const PSEUDO_DEFAULT_ID = "__pseudo_default__"/);
  });

  it('"default" NO consulta la DB buscando `isDefault: true`', () => {
    // Ese lookup devolvía el canvas de Kickoff (el ancla) y titulaba mal el PDF del Resumen.
    expect(SRC).not.toMatch(/findFirst\(\{[\s\S]{0,120}isDefault:\s*true/);
  });

  it("el canvas de Kickoff sigue siendo el ancla — o sea, el flag sigue sin servir de criterio", () => {
    // Si algún día el kickoff dejara de ser `isDefault`, el bug original no podría repetirse
    // y este test pasaría a proteger algo que ya no existe. Que falle es la señal de releerlo.
    const defs = fs.readFileSync(path.join(process.cwd(), "lib", "canvas", "canvas-defs.ts"), "utf8");
    const bloqueKickoff = defs.slice(defs.indexOf('slug: "kickoff"'));
    expect(bloqueKickoff.slice(0, 400)).toMatch(/isDefault:\s*true/);
  });
});
