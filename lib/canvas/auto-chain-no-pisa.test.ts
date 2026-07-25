/**
 * lib/canvas/auto-chain-no-pisa.test.ts — GUARD: regenerar el handoff no puede volver a
 * pisar el requerimiento técnico.
 *
 * Qué pasaba: al terminar el handoff, si el proyecto tenía tag de desarrollo a medida,
 * el encadenado corría el generador del requerimiento técnico. Y ese generador borra
 * TODOS los bloques de cada sección que escribe, sin mirar quién los escribió. O sea:
 * regenerar un handoff destruía en silencio —por atrás, sin confirmación y sin dejar
 * corrida— lo que el equipo técnico hubiera editado a mano. Wherex lo tenía.
 *
 * Como el borrado vive dentro del generador y ahí es correcto (el botón "Regenerar" del
 * canvas SÍ debe reemplazar el documento, es lo que promete), el arreglo está en el
 * llamador: el encadenado solo escribe cuando el documento todavía no existe.
 *
 * Este test es de LECTURA DE CÓDIGO, no de comportamiento: la lógica vive en el medio de
 * un endpoint de 3.000 líneas que no se puede invocar sin base ni sesión. Es la misma
 * forma que usan los otros candados del repo (lib/pieces/enabled-filter.test.ts,
 * lib/ui/full-bleed-workspaces.test.ts) y sirve para lo que tiene que servir: que nadie
 * borre la comprobación sin enterarse de por qué estaba.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RUTA = path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts");
const SRC = fs.readFileSync(RUTA, "utf8");

/** El bloque del encadenado: desde que asegura el canvas hasta que cierra el try. */
function bloqueDelEncadenado(): string {
  const desde = SRC.indexOf("const desarrolloCanvasId = await ensureDesarrolloCanvas");
  expect(desde, "ya no existe el encadenado de Desarrollo en analyze").toBeGreaterThan(-1);
  return SRC.slice(desde, desde + 1600);
}

describe("🔒 el encadenado del handoff no pisa el requerimiento técnico", () => {
  it("pregunta si el documento ya tiene contenido antes de escribirlo", () => {
    const bloque = bloqueDelEncadenado();
    expect(
      bloque.includes("loadCanvasesConContenido"),
      "el encadenado dejó de comprobar si el requerimiento técnico ya está escrito: " +
        "así vuelve a borrar en silencio lo que alguien editó a mano",
    ).toBe(true);
  });

  it("la generación queda del lado en que NO hay contenido", () => {
    const bloque = bloqueDelEncadenado();
    const iComprobacion = bloque.indexOf("conContenido.has");
    const iGeneracion = bloque.indexOf("runDesarrolloGeneration");
    expect(iComprobacion, "no se comprueba el contenido").toBeGreaterThan(-1);
    expect(iGeneracion, "no se llama al generador").toBeGreaterThan(-1);
    expect(
      iComprobacion < iGeneracion,
      "el generador se llama ANTES de comprobar si hay contenido — el orden es el bug",
    ).toBe(true);
  });

  it("usa el criterio ÚNICO de contenido, no uno propio", () => {
    // Contar "tiene algún bloque" daría verdadero siempre (la creación siembra el cierre)
    // y el encadenado no escribiría nunca. El criterio honesto vive en un solo lugar.
    expect(SRC).toContain('from "@/lib/pieces/piece-content"');
  });

  it("le pasa la corrida al generador, para que los bloques digan quién los escribió", () => {
    const bloque = bloqueDelEncadenado();
    expect(
      /agentRunId\s*,/.test(bloque),
      "el encadenado volvió a generar sin atribuir la corrida: los bloques quedan sin rastro",
    ).toBe(true);
  });
});

describe("el generador del requerimiento técnico sigue reemplazando (eso está bien)", () => {
  it("borra los bloques de la sección que escribe", () => {
    // Es lo que el botón "Regenerar" promete y por eso NO se toca acá. El guard de
    // arriba existe justamente porque ese borrado es correcto en su lugar y destructivo
    // en el otro.
    const gen = fs.readFileSync(path.join(process.cwd(), "lib/canvas/desarrollo-generate.ts"), "utf8");
    expect(gen).toContain("canvasBlock.deleteMany");
  });
});
