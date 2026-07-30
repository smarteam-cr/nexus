/**
 * lib/portfolio/setup-por-pipeline.test.ts — los pasos de setup que le corresponden a cada
 * proyecto, y el espejo del tipo que vive en el widget.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. Un proyecto de Desarrollo mostraba un chip rojo **permanente** "Sin kickoff" en el
 *    widget que el CSE mira todos los días, por una pieza con la que ese pipeline no nace.
 *    La distinción que lo arregla es `null` (no aplica) vs `false` (falta): un chip ausente
 *    dice "no corresponde", uno rojo dice "te falta".
 * 2. `components/clients/ProjectGPS.tsx` tiene un ESPEJO INLINE del tipo `SetupSignals` —lo
 *    admite en su propio comentario, para no arrastrar Prisma al bundle— y hasta hoy nada
 *    lo ataba. Un campo que cambia de un lado y no del otro compila igual y miente en
 *    pantalla.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SETUP_CANVAS_SLUGS, deriveSetup, pasosDeSetup } from "./project-setup";
import { pipelineByKey } from "@/lib/projects/kind";

const DEV = pipelineByKey("development").hubspotPipelineId;
const CS = pipelineByKey("customer-success").hubspotPipelineId;
const WEB = pipelineByKey("web").hubspotPipelineId;

describe("qué pasos de setup le corresponden a cada pipeline", () => {
  it("sin pipeline: la lista completa, LITERAL (la fila legacy)", () => {
    // Transcrito, no derivado: si mañana alguien suma un paso, que sea una decisión visible.
    expect(pasosDeSetup(null)).toEqual(["handoff", "kickoff"]);
    expect(pasosDeSetup("un-pipeline-que-nadie-declaro")).toEqual(["handoff", "kickoff"]);
  });

  it("Desarrollo: sin kickoff", () => {
    expect(pasosDeSetup(DEV)).not.toContain("kickoff");
    expect(pasosDeSetup(DEV)).toContain("handoff");
  });

  it("Customer Success y Sitios web: con kickoff", () => {
    expect(pasosDeSetup(CS)).toContain("kickoff");
    expect(pasosDeSetup(WEB)).toContain("kickoff");
  });

  it("ningún pipeline exige un paso con el que NO nace", () => {
    /* La propiedad de fondo: el widget no puede pedirle a un proyecto una pieza que su
       pipeline nunca le iba a dar. */
    for (const key of ["customer-success", "development", "web"] as const) {
      const def = pipelineByKey(key);
      for (const paso of pasosDeSetup(def.hubspotPipelineId)) {
        expect(
          def.seedPieces,
          `${def.label} exige "${paso}" en el setup y no está en sus seedPieces`,
        ).toContain(paso);
      }
    }
  });
});

describe("deriveSetup distingue «no aplica» de «falta»", () => {
  const base = { steps: new Set<string>(), hasActiveBaseline: false, hasPhases: false, hasProcesos: false };

  it("le corresponde y no está → false (chip rojo)", () => {
    expect(deriveSetup({ ...base, aplican: SETUP_CANVAS_SLUGS }).kickoff).toBe(false);
  });

  it("no le corresponde → null (sin chip)", () => {
    expect(deriveSetup({ ...base, aplican: ["handoff"] }).kickoff).toBeNull();
  });

  it("le corresponde y está → true", () => {
    expect(deriveSetup({ ...base, steps: new Set(["kickoff"]), aplican: SETUP_CANVAS_SLUGS }).kickoff).toBe(true);
  });

  it("sin `aplican`: comportamiento legacy exacto", () => {
    // El batch del panel de cartera no lo pasa — solo ve proyectos de CS por construcción.
    expect(deriveSetup(base).kickoff).toBe(false);
    expect(deriveSetup({ ...base, steps: new Set(["kickoff"]) }).kickoff).toBe(true);
  });
});

describe("el espejo del widget coincide con el tipo real", () => {
  it("mismas claves en SetupSignals de los dos lados", () => {
    const claves = (src: string, ancla: RegExp): string[] => {
      const m = ancla.exec(src);
      if (!m) return [];
      const desde = src.indexOf("{", m.index);
      let nivel = 0;
      let i = desde;
      for (; i < src.length; i++) {
        if (src[i] === "{") nivel++;
        else if (src[i] === "}") {
          nivel--;
          if (nivel === 0) break;
        }
      }
      return [...src.slice(desde, i).matchAll(/^\s{2}(\w+)\??:/gm)].map((x) => x[1]).sort();
    };
    const raiz = process.cwd();
    const real = claves(
      fs.readFileSync(path.join(raiz, "lib/portfolio/project-setup.ts"), "utf8"),
      /export interface SetupSignals/,
    );
    const espejo = claves(
      fs.readFileSync(path.join(raiz, "components/clients/ProjectGPS.tsx"), "utf8"),
      /type SetupSignals = /,
    );
    expect(real.length, "no pude leer el tipo real").toBeGreaterThan(0);
    expect(
      espejo,
      "El espejo inline de SetupSignals en ProjectGPS.tsx quedó desalineado del tipo real de " +
        "lib/portfolio/project-setup.ts. El archivo admite que es una copia; esto es lo único " +
        "que la ata. Un campo que cambia de un lado y no del otro compila igual y miente en pantalla.",
    ).toEqual(real);
  });

  it("el chip del kickoff no se pinta cuando no aplica", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/clients/ProjectGPS.tsx"), "utf8");
    expect(
      src,
      "el chip de kickoff tiene que estar guardado por `!== null`, o un desarrollo vuelve a " +
        "mostrar «Sin kickoff» en rojo para siempre",
    ).toContain("data.setup.kickoff !== null");
  });
});
