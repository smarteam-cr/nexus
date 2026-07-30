/**
 * lib/projects/seed-pieces.test.ts — con qué piezas NACE un proyecto, por pipeline.
 *
 * Hay dos registros que se rozan y responden preguntas distintas:
 *   · `lib/pieces/registry.ts` — QUÉ ES cada pieza (incluido `createdWithProject`).
 *   · `lib/projects/kind.ts`   — QUÉ PIEZAS le tocan a cada pipeline (`seedPieces`).
 *
 * `createDefaultCanvases` usa `seedPieces` cuando conoce el pipeline y cae al registro de
 * piezas cuando no. Una fuente por pregunta — pero comparten una respuesta, y ahí es donde
 * pueden divergir: **la fila de Customer Success ES la lista legacy**. Este test las ata en
 * los dos sentidos.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. Poner en `seedPieces` una pieza `createdWithProject: false` la **resucita en todos los
 *    proyectos nuevos**. Ya pasó y costó caro: 111 cascarones de Handoff vacíos y 234
 *    canvases de Diagnóstico y Planificación que hubo que retirar a mano. La tabla venía con
 *    `implementation` en la fila de CS justamente porque nadie la leía.
 * 2. Declarar un slug sin definición de canvas: `createDefaultCanvases` lo **descarta en
 *    silencio**. Así un proyecto de Desarrollo nacería sin `tech-requirements`, su pieza
 *    central, y se vería normal.
 * 3. Sacarle el `handoff` a un pipeline por descuido al tocar la exclusión.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_PIPELINES, pipelineByKey } from "./kind";
import { PIECES, piecesCreatedWithProject } from "@/lib/pieces/registry";
import { canvasDefForSlug } from "@/lib/canvas/canvas-defs";

/** Espejo de la constante de `lib/canvas/default-canvases.ts`. El test de abajo la ata. */
const NO_NACEN_ACA = new Set(["handoff"]);

describe("seedPieces — toda pieza declarada existe y sabe nacer", () => {
  for (const p of PROJECT_PIPELINES) {
    it(`${p.label}: sus slugs son piezas registradas de proyecto`, () => {
      for (const slug of p.seedPieces) {
        const pieza = PIECES.find((x) => x.slug === slug);
        expect(pieza, `"${slug}" no existe en lib/pieces/registry.ts`).toBeDefined();
        expect(
          pieza!.scope,
          `"${slug}" no es una pieza de PROYECTO — no puede nacer con uno`,
        ).toBe("project");
      }
    });

    it(`${p.label}: toda pieza que nace acá tiene definición de canvas`, () => {
      /* Sin esto, `createDefaultCanvases` la descarta en silencio y el proyecto nace
         incompleto sin un solo error. Es exactamente lo que le pasaba a
         `tech-requirements`, que no está en DEFAULT_PROJECT_CANVASES. */
      const sinDefinicion = p.seedPieces
        .filter((s) => !NO_NACEN_ACA.has(s))
        .filter((s) => canvasDefForSlug(s) === null);
      expect(
        sinDefinicion,
        `${p.label} declara ${sinDefinicion.join(", ")} y no hay definición de canvas para ` +
          `ese slug. Se descartaría EN SILENCIO al crear el proyecto.`,
      ).toEqual([]);
    });

    it(`${p.label}: lleva el handoff declarado`, () => {
      expect(
        p.seedPieces,
        `A ${p.label} le corresponde un handoff. Se declara acá aunque lo monte ` +
          `createHandoffCanvas: la exclusión tiene nombre y está testeada, el olvido no.`,
      ).toContain("handoff");
    });
  }

  it("la exclusión es exactamente el handoff", () => {
    // Si mañana hay que excluir otra, que sea una decisión visible y no un `if` colado.
    expect([...NO_NACEN_ACA]).toEqual(["handoff"]);
  });

  it("el espejo de este test coincide con la constante real", () => {
    /* `NO_NACEN_ACA` acá arriba es una COPIA de `PIEZAS_QUE_NO_NACEN_ACA` en
       lib/canvas/default-canvases.ts. Sin esta atadura, alguien cambia la constante, el test
       sigue verde probando otra cosa, y la guarda pasa a dar falsa seguridad — que es peor
       que no tenerla. */
    const src = fs.readFileSync(path.join(process.cwd(), "lib/canvas/default-canvases.ts"), "utf8");
    const m = /const PIEZAS_QUE_NO_NACEN_ACA = new Set\(\[([^\]]*)\]\)/.exec(src);
    expect(m, "no encontré PIEZAS_QUE_NO_NACEN_ACA en default-canvases.ts").not.toBeNull();
    const real = m![1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    expect(real.sort(), "el espejo de este test quedó desactualizado").toEqual([...NO_NACEN_ACA].sort());
  });
});

describe("la fila de Customer Success ES la lista legacy", () => {
  /* Ésta es la aserción que impide la deriva. `createDefaultCanvases` usa `seedPieces` con
     pipeline conocido y `piecesCreatedWithProject()` sin él; si las dos respuestas no
     coinciden para Customer Success, el MISMO proyecto nacería distinto según si el backfill
     ya corrió. */
  const legacy = new Set(piecesCreatedWithProject().map((p) => p.slug));
  const cs = new Set(pipelineByKey("customer-success").seedPieces.filter((s) => !NO_NACEN_ACA.has(s)));

  it("todo lo que nace por el registro de piezas está en la fila de CS", () => {
    const faltan = [...legacy].filter((s) => !cs.has(s));
    expect(
      faltan,
      `El registro de piezas marca ${faltan.join(", ")} como createdWithProject, y la fila de ` +
        `Customer Success de lib/projects/kind.ts no las tiene. Un proyecto de CS nacería sin ` +
        `ellas apenas se le resuelva el pipeline.`,
    ).toEqual([]);
  });

  it("y al revés: la fila de CS no agrega ninguna que el registro no cree", () => {
    const sobran = [...cs].filter((s) => !legacy.has(s));
    expect(
      sobran,
      `La fila de Customer Success declara ${sobran.join(", ")}, que el registro de piezas ` +
        `NO marca como createdWithProject. Agregarla ahí la RESUCITA en todos los proyectos ` +
        `nuevos — es como se llenaron de canvases vacíos los 118 proyectos. Si de verdad ` +
        `tiene que nacer, el cambio va en lib/pieces/registry.ts, no acá.`,
    ).toEqual([]);
  });
});

describe("las diferencias entre pipelines son deliberadas", () => {
  it("Desarrollo lleva su requerimiento técnico y NO lleva kickoff", () => {
    const dev = pipelineByKey("development").seedPieces;
    expect(dev, "tech-requirements es la pieza central de un desarrollo").toContain(
      "tech-requirements",
    );
    expect(
      dev,
      "un desarrollo no le presenta un kickoff al cliente: su entregable es el requerimiento",
    ).not.toContain("kickoff");
  });

  it("Sitios web SÍ lleva kickoff — es su landing de cara al cliente", () => {
    expect(pipelineByKey("web").seedPieces).toContain("kickoff");
  });

  it("Customer Success no lleva `implementation`", () => {
    /* Se creaba vacía en los 118 proyectos. Está documentado en el registro de piezas y la
       tabla la traía igual, porque nadie la leía. */
    expect(pipelineByKey("customer-success").seedPieces).not.toContain("implementation");
  });
});
