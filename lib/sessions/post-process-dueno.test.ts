import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/sessions/post-process-dueno.test.ts — EL POST-PROCESO NO DECIDE DE QUIÉN ES LA REUNIÓN.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Hasta el 2026-10-09 el post-proceso armaba su propio `CategorizeContext` —sin el mapa de HubSpot—
 * y volvía a correr la cascada. Podía decidir un cliente distinto del que `resolvedClientId` (la
 * fuente ÚNICA de "de quién es la sesión") había decidido con el contexto completo, y escribir la
 * minuta, las acciones y los pedidos fuera de alcance en el cliente equivocado. Era una segunda copia
 * del resolver: lo que el invariante 2 de CLAUDE.md prohíbe.
 *
 * Ahora lee el dueño con `duenoDeLaSesion` (lib/sessions/project-sources.ts) y, sin dueño, no lee.
 * (DECISIONS › Memoria de la cuenta · Etapa 0.)
 */

const SRC = fs.readFileSync(path.join(process.cwd(), "lib/sessions/post-process.ts"), "utf8");

/** Solo el código: los comentarios pueden explicar la forma vieja sin que la guarda se caiga. */
const CODIGO = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("el post-proceso toma el dueño de resolvedClientId", () => {
  it("LA guarda: no vuelve a categorizar la reunión", () => {
    expect(CODIGO, "volvió una segunda copia del resolver").not.toContain("categorizeSession(");
    expect(CODIGO, "volvió el contexto de categorización (sin el mapa de HubSpot)").not.toContain(
      "hubspotCompaniesByDomain",
    );
  });

  it("lee el dueño por el helper del chokepoint", () => {
    expect(CODIGO).toContain("duenoDeLaSesion(");
    expect(CODIGO, "la sesión tiene que traer su resolución").toContain("resolvedClientId: true");
  });

  it("sin dueño, no lee (y lo dice)", () => {
    expect(CODIGO).toContain("Sin dueño: la reunión no está atribuida a ningún cliente");
  });
});
