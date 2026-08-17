import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { elegirFaseDeSemanaCero } from "./semana-cero-tareas";

/**
 * lib/timeline/primera-generacion-curada.test.ts — LA PRIMERA GENERACIÓN TAMBIÉN SE REVISA.
 *
 * Todo el cronograma pasa por curación: el CSE ve la propuesta en dos columnas, arrastra, edita y
 * recién ahí se escribe. Todo menos UNA puerta — la primera generación del detalle, que hacía
 * `createMany` directo. Era la única que entraba sin que nadie la mirara y, justamente, la que más
 * filas crea (un cronograma nuevo son decenas de tareas de un saque).
 *
 * ── LO QUE SE PIERDE SI ESTO SE ROMPE, Y POR QUÉ NO SE NOTA ─────────────────
 * Mandar la generación por curación tiene tres cosas que el camino viejo hacía y el circuito de
 * curación NO sabía hacer. Las tres fallan MUDAS: no rompen un test, no rompen el build, y el
 * cronograma se ve razonable igual.
 *
 *  1. Las cinco tareas fijas de la «Semana 0» (accesos, base de datos, usuarios, Academy). Se
 *     sembraban dentro del camino que escribía. Sin ellas el proyecto arranca sin pedirle nada al
 *     cliente y se descubre en la reunión de kickoff.
 *  2. El `activityType` de cada fase. Sin él las barras del Gantt pierden su color y la leyenda que
 *     ve el cliente queda sin sentido.
 *  3. El permiso. El apply completo pedía la vara del REGEN, que el CSE no tiene
 *     (permissions/defaults.ts: `cronograma: ["write", "generate"]`). Sin el escalón por cronograma
 *     vacío, el CSE vería la propuesta y no podría aplicarla — le habríamos sacado la capacidad de
 *     crear el cronograma sin decirlo en ningún lado.
 */

const RAIZ = process.cwd();
/** Mencionar ≠ hacer: los comentarios se blanquean antes de escanear (molde de costos-privacy). */
function soloCodigo(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const RUTA_AGENTE = "app/api/clients/[id]/analyze/route.ts";
const RUTA_APPLY = "app/api/projects/[projectId]/timeline/detail/apply-all/route.ts";
const GUARDS = "lib/auth/api-guards.ts";

describe("⛔ el agente de detalle no escribe ni una tarea", () => {
  const src = soloCodigo(RUTA_AGENTE);

  it("⭐ la ruta que corre el agente no toca TimelineTask", () => {
    /* La forma más fuerte de la guarda: no es que la UI mande `preview: true` — es que en la ruta
       NO EXISTE código que cree, borre o modifique una tarea. Un POST armado a mano tampoco puede
       saltearse la curación, porque no hay a dónde saltar. */
    expect(src, "volvió una escritura de tareas al camino del agente").not.toMatch(
      /timelineTask\s*\.\s*(create|createMany|deleteMany|updateMany|update)\s*\(/,
    );
  });

  it("y la función que persistía el detalle no volvió", () => {
    expect(src).not.toContain("persistTimelineDetailFromAgentOutput");
  });

  it("⚠ la propuesta NO depende de una bandera que manda el cliente", () => {
    /* El modo de falla que esto cierra: que alguien reponga `if (previewOnly && …)`. Ahí la
       curación pasa a ser una gentileza del navegador — el que no la mande, escribe. */
    const i = src.indexOf("if (isTimelineDetailAgent) {");
    expect(i, "se movió el ancla: revisá esta guarda").toBeGreaterThan(0);
    const tramo = src.slice(i, src.indexOf("updateCanvasAsync", i));
    expect(tramo.length, "el tramo salió vacío — la guarda no está mirando nada").toBeGreaterThan(300);
    expect(tramo, "la propuesta volvió a depender de una bandera del cliente").not.toContain("previewOnly");
    expect(tramo).toContain("computeTimelineDetailPreviewAllPhases(");
  });
});

describe("⛔ lo que el camino viejo hacía y la curación tuvo que aprender", () => {
  const src = soloCodigo(RUTA_AGENTE);

  it("⭐ los DOS previews siembran las tareas fijas de la Semana 0", () => {
    /* Dos call sites: el de una fase y el de todas. Con uno solo, la primera generación (que usa
       el de todas) o el regen de la Semana 0 se quedarían sin las cinco, en silencio. */
    /* `await` y no el nombre pelado: sin eso la DECLARACIÓN de la función cuenta como una
       llamada y la guarda pasa en verde con un solo preview sembrando. Lo cazó ella misma. */
    const llamadas = src.match(/await fijasDeSemanaCeroParaPreview\(/g) ?? [];
    expect(llamadas.length, "un preview dejó de sembrar las tareas fijas").toBe(2);
  });

  it("y el preview acarrea el activityType propuesto", () => {
    expect(src).toContain("activityTypePropuesto(");
    expect(src, "el preview dejó de devolver el tipo de actividad").toMatch(
      /activityType:\s*phase\.activityType === null \? propuesto : null/,
    );
  });

  it("⚠ el apply escribe el tipo SOLO si la fase no tiene uno", () => {
    /* Solo-si-null es lo que impide que una regeneración le pise al CSE el tipo que eligió a mano.
       Sacar la condición no rompe nada visible: el Gantt sigue teniendo colores — otros. */
    const apply = soloCodigo(RUTA_APPLY);
    expect(apply).toContain("timelinePhase.update(");
    expect(apply, "el apply pasó a pisar el tipo elegido a mano").toMatch(
      /if \(activityType && phase\.activityType === null\)/,
    );
  });

  it("y la trazabilidad de la corrida sobrevive al cambio de escritor", () => {
    expect(soloCodigo(RUTA_APPLY)).toContain("detailGeneratedByAgentRunId");
  });
});

describe("⛔ el escalón de permiso cuelga de que el cronograma esté VACÍO", () => {
  const guards = soloCodigo(GUARDS);

  it("con tareas pide la vara del regen; vacío, la del apply por fase", () => {
    const i = guards.indexOf("export async function guardTimelineDetailApply");
    expect(i, "se movió el ancla: revisá esta guarda").toBeGreaterThan(0);
    const tramo = guards.slice(i, guards.indexOf("export async function guardTimelineFullRegen", i));
    expect(tramo.length, "el tramo salió vacío — la guarda no mira nada").toBeGreaterThan(200);
    expect(tramo, "el escalón dejó de depender del cronograma vacío").toMatch(
      /cronogramaVacio \? "editTimeline" : "regenerateTimeline"/,
    );
    expect(tramo, "se perdió la medición de si hay tareas").toMatch(/timelineTask\.count\(/);
  });

  it("⚠ y el apply completo usa ESE guard, no el de vara fija", () => {
    /* Si vuelve `guardTimelineFullRegen`, el CSE deja de poder crear el cronograma — y el síntoma
       es un 403 en el botón «Crear las tareas», que se lee como «se rompió el permiso», no como
       «alguien cambió el guard». */
    const apply = soloCodigo(RUTA_APPLY);
    expect(apply).toContain("guardTimelineDetailApply(projectId)");
    expect(apply, "volvió la vara fija del regen completo").not.toContain("guardTimelineFullRegen");
  });
});

describe("cuál es la fase de «Semana 0»", () => {
  /* ⚠ La fase de orden 0 se llama a propósito de una forma que el fallback por NOMBRE no
     reconoce, y hay otra más abajo que sí. Con «Semana 0 – Arranque» en el orden 0 el fixture no
     discriminaba: las dos reglas devolvían la misma fase y el test pasaba en verde aunque el
     nombre le ganara al orden. Se descubrió rompiéndolo. */
  const fases = [
    { order: 1, name: "Sales Hub" },
    { order: 0, name: "Arranque y relevamiento" },
    { order: 2, name: "Kick-off del proyecto" },
  ];

  it("manda el orden, no el nombre", () => {
    /* El fallback por nombre existe para los cronogramas viejos. Si ganara sobre el orden, en un
       cronograma con una fase llamada «Kick-off» en el medio las cinco tareas fijas aterrizarían
       ahí — a mitad del proyecto, pidiendo accesos que ya se dieron. */
    expect(elegirFaseDeSemanaCero(fases)?.order).toBe(0);
    expect(elegirFaseDeSemanaCero(fases)?.name).toBe("Arranque y relevamiento");
  });

  it("y sin fase de orden 0 cae al nombre", () => {
    expect(elegirFaseDeSemanaCero([{ order: 3, name: "Kick-off del proyecto" }])?.name).toContain("Kick");
    expect(elegirFaseDeSemanaCero([{ order: 5, name: "SEMANA 0" }])?.order).toBe(5);
  });

  it("sin fases, null — nunca una fase inventada", () => {
    expect(elegirFaseDeSemanaCero([])).toBeNull();
    expect(elegirFaseDeSemanaCero([{ order: 4, name: "Marketing Hub" }])).toBeNull();
  });
});

describe("⭐ y la pantalla manda las dos puertas al mismo acordeón", () => {
  const canvas = soloCodigo("components/canvas/CronogramaCanvas.tsx");

  it("la primera generación y «Regenerar todo» llaman a la misma función", () => {
    expect(canvas).toContain('pedirPropuestaDeDetalle("primera")');
    expect(canvas).toContain('pedirPropuestaDeDetalle("regen")');
  });

  it("⚠ y no quedó un camino de la pantalla que escriba sin curar", () => {
    /* `generateDetail` era el que posteaba sin `preview`. Que su nombre no vuelva es lo que evita
       que alguien reponga el atajo «para la primera vez» sin darse cuenta de lo que saltea. */
    expect(canvas, "volvió el camino que generaba sin curación").not.toContain("generateDetail(");
  });
});
