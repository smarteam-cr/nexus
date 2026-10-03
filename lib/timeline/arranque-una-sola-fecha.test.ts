/**
 * lib/timeline/arranque-una-sola-fecha.test.ts — la fecha de arranque es UNA (2026-10-02).
 *
 * Caso «CAV - SHP»: la portada del kickoff decía «23 de septiembre» (un texto escrito por el chat),
 * el cronograma decía 21-sep y el enlace del cliente 1-sep, porque (1) la portada solo se podía
 * cambiar por chat y escribía un texto encima, y (2) «Subir» el kickoff no renovaba la foto del
 * cronograma, que es de donde el enlace lee la fecha. Estas guardas son de FUENTE: el editor es
 * React y la cadena atraviesa tres archivos.
 *
 * Correr: `npx vitest run lib/timeline/arranque-una-sola-fecha.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("la fecha de arranque se edita a mano y mueve el cronograma", () => {
  it("la portada del kickoff en edición usa el selector de fecha, que escribe el ancla", () => {
    const src = leer("components/canvas/kickoff-sections/KickoffSections.tsx");
    expect(src, "la portada volvió a mostrar la fecha sin poder editarla").toContain("<HeroStatFecha");
    expect(src, "el selector no llama al cambio del ancla").toContain("ctx.kickoff!.onSetArranque!(ymd)");
  });

  it("el editor del kickoff le pasa el cambio de ancla a la portada", () => {
    const src = leer("components/canvas/KickoffWorkspace.tsx");
    expect(src).toContain("onSetArranque: k.cambiarArranque");
  });

  it("el cambio va al endpoint del ancla, no a un campo de texto del bloque", () => {
    const src = leer("components/canvas/useKickoffData.ts");
    expect(src).toContain("/timeline/arranque");
  });

  it("el endpoint deja el mismo rastro que el Gantt: evento para el vigilante y registro del cambio", () => {
    const src = leer("app/api/projects/[projectId]/timeline/arranque/route.ts");
    expect(src).toContain("guardTimelineEdit(");
    expect(src).toContain('action: "ANCHOR_CHANGED"');
    expect(src).toContain("prisma.timelineChange.create(");
  });
});

describe("el enlace del cliente no queda con la fecha vieja", () => {
  it("el estado del kickoff avisa cuando el cronograma publicado quedó atrás", () => {
    const src = leer("app/api/projects/[projectId]/kickoff-content/route.ts");
    expect(src).toContain("cronogramaSinSubir");
    expect(src).toContain("cronogramaSinPublicar");
  });

  it("«Subir» el kickoff sube también el cronograma cuando quedó atrás, y eso cuenta como pendiente", () => {
    const src = leer("components/canvas/useKickoffData.ts");
    expect(src, "un cronograma atrasado tiene que encender la barra de «sin subir»").toContain(
      "const dirty = visibilityDirty || contentDirty || cronogramaSinSubir;",
    );
    const i = src.indexOf("const publishChanges");
    const tramo = src.slice(i, src.indexOf("return {", i));
    expect(tramo.length, "la guarda no mira nada").toBeGreaterThan(300);
    expect(tramo).toContain("if (cronogramaSinSubir)");
    expect(tramo).toContain("/publish-timeline");
  });
});
