/**
 * lib/pieces/no-name-lookups.test.ts — RATCHET: la identidad de una pieza es el
 * SLUG, no su nombre visible.
 *
 * Historia (2026-07-24): la identidad de un canvas era su `name`, repetido en 8+
 * lugares — mapa agente→canvas, celda de permiso, vista externa del cliente, el
 * contexto que se le pasa a los agentes y hasta un `name: { not: "Handoff" }`.
 * Renombrar una pieza rompía ruteo, permisos y la página del cliente A LA VEZ, y
 * dejaba huérfanos los canvases ya creados.
 *
 * Este guard escanea el fuente y falla si vuelve a aparecer un lookup por nombre en
 * los caminos CRÍTICOS. La lista de deuda solo puede encoger: si un archivo baja su
 * cuenta hay que actualizar la entrada, y cuando llega a 0 se borra.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PIECES } from "./registry";

const RAIZ = process.cwd();

/** Los nombres visibles que ANTES hacían de identidad. */
const NOMBRES = PIECES.flatMap((p) => p.legacyNames);

/**
 * Un lookup por nombre = el nombre de una pieza usado dentro de un `where` de
 * Prisma (`name: "Kickoff"`). No cuenta el nombre en prosa, ni en un rótulo de UI,
 * ni en las definiciones del propio registro (que es donde DEBE vivir).
 */
function lookupsPorNombre(rel: string): number {
  const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  let n = 0;
  for (const nombre of NOMBRES) {
    const re = new RegExp(`name:\\s*"${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
    n += (src.match(re) ?? []).length;
  }
  return n;
}

/**
 * Caminos CRÍTICOS: acá un lookup por nombre no es deuda cosmética — rompe datos,
 * permisos, ruteo o la vista del cliente. Deben quedar en CERO.
 */
const CRITICOS = [
  "lib/auth/permissions/artifact-gate.ts", // permisos generate/regenerate
  "lib/external/kickoff-view.ts", // página que abre el cliente
  "lib/external/desarrollo-view.ts", // página que abre el dev externo
  "lib/canvas/kickoff-snapshot.ts", // lo único que ve el cliente al publicar
  "lib/canvas/load-canvas-context.ts", // embudo del contexto de 8 agentes
  "app/api/projects/[projectId]/canvases/route.ts", // dropdown del proyecto
  "app/api/projects/[projectId]/kickoff-content/route.ts",
];

describe("los caminos críticos NO identifican piezas por nombre", () => {
  for (const rel of CRITICOS) {
    it(`${rel} usa slug, no nombre`, () => {
      expect(
        lookupsPorNombre(rel),
        `${rel} volvió a buscar un canvas por su NOMBRE. Usá canvasOf(slug) / ` +
          `canvasOfNested(slug) de lib/pieces/canvas-query.ts — si no, renombrar la ` +
          `pieza rompe este camino en silencio.`,
      ).toBe(0);
    });
  }
});

describe("el registro es la única fuente de nombres", () => {
  it("cada definición de canvas trae un slug del registro, y su name es un nombre legacy de esa pieza", async () => {
    const defs = await import("@/lib/canvas/canvas-defs");
    const todas = [
      defs.HANDOFF_CANVAS,
      defs.BUSINESS_CASE_CANVAS,
      defs.DESARROLLO_CANVAS,
      ...defs.DEFAULT_PROJECT_CANVASES,
    ];
    for (const def of todas) {
      const pieza = PIECES.find((p) => p.slug === def.slug);
      expect(pieza, `la definición "${def.name}" declara slug "${def.slug}", que no existe en el registro`)
        .toBeDefined();
      // El Business Case es el caso especial: su `name` es la VERSIÓN ("Plantilla",
      // "Propuesta 1"), no la pieza — por eso el registro no le pone legacyNames y el
      // backfill lo resuelve por `businessCaseId`.
      if (pieza!.legacyNames.length === 0) continue;
      expect(
        pieza!.legacyNames,
        `la definición de ${def.slug} se llama "${def.name}", que no está entre los ` +
          `legacyNames de la pieza — el backfill por nombre dejaría huérfanos los canvases ya creados.`,
      ).toContain(def.name);
    }
  });

  it("cambiar el RÓTULO de una pieza no cambia a qué canvases apunta", async () => {
    // Es LA promesa de F1: el renombre de F4 ("Desarrollo" → "Requerimientos
    // técnicos") tiene que ser un cambio de texto. Si `label` se filtrara en la
    // consulta, renombrar dejaría fuera los 18 canvases ya creados.
    const { canvasOf } = await import("./canvas-query");
    for (const p of PIECES) {
      const serializado = JSON.stringify(canvasOf(p.slug));
      expect(
        serializado.includes(p.label) && !p.legacyNames.includes(p.label),
        `canvasOf("${p.slug}") menciona el rótulo "${p.label}" — el renombre rompería la consulta.`,
      ).toBe(false);
    }
  });

  it("el mapa agentGroup→pieza apunta a SLUGS, no a nombres visibles", async () => {
    const { AGENT_GROUP_TO_CANVAS } = await import("@/lib/canvas/canvas-defs");
    const slugs = new Set(PIECES.map((p) => p.slug));
    for (const [grupo, destino] of Object.entries(AGENT_GROUP_TO_CANVAS)) {
      expect(slugs.has(destino), `agentGroup "${grupo}" apunta a "${destino}", que no es un slug`).toBe(
        true,
      );
    }
  });
});
