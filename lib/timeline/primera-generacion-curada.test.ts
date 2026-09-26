import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { elegirFaseDeSemanaCero } from "./semana-cero-tareas";
import { FORMATO_BORRADOR, planDeAplicacion, type Borrador, type Cambio, type Vivo } from "./borrador";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

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
 *  3. El permiso. El apply completo pedía la vara del REGEN, que Ventas y Marketing no tienen
 *     (permissions/defaults.ts: `cronograma: ["write", "delete", "generate"]`; el CSE la tiene desde
 *     la decisión de Elías 2026-09-23). Sin el escalón por cronograma vacío, esos roles verían la
 *     propuesta y no podrían aplicarla — les habríamos sacado la capacidad de crear el cronograma
 *     sin decirlo en ningún lado.
 *
 * ⚠ E2b P5b (2026-09-25): la curación de dos columnas se borró. Las dos puertas y «Regenerar» de una
 * fase dejan UNA propuesta que se revisa en la barra de arriba del Gantt (se marca o se desmarca) y se
 * aplica con POST /timeline/borrador/aplicar; apply-all quedó como lápida. Las tres cosas de arriba se
 * vigilan ahora en ese camino: las fijas y el tipo en el borrador del detalle (R7 y R6), y el permiso
 * en `guardIaDelCronograma`.
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
// E2b P5a: las fijas de la Semana 0 (R7) y el tipo de actividad (R6) viven en el borrador del detalle.
const RUTA_DETALLE = "lib/timeline/tareas-del-detalle.ts";
const RUTA_FUSION = "lib/timeline/borrador-del-detalle.ts";
// E2b P5b: aplicar es el del borrador. apply-all (el aplicar del acordeón de dos columnas) es una lápida.
const RUTA_APPLY = "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts";
const ESCRITOR = "lib/timeline/escribir-estructura.ts";
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
    /* ⚠ ACTUALIZADA en E2b P5a (2026-09-25), con esta razón: pedía la vista previa de todas las fases
       (`computeTimelineDetailPreviewAllPhases`), que se borró con la de una fase. Lo que armó el agente
       entra al borrador: la salida del detalle es la fusión. Sacarla (o volver a una vista previa que
       la pantalla aplique por su cuenta) la pone en rojo. */
    expect(tramo).toContain("fusionarDetalleEnElBorrador(");
    expect(tramo, "volvió una vista previa del detalle").not.toContain("computeTimelineDetailPreview");
  });
});

describe("⛔ lo que el camino viejo hacía y la curación tuvo que aprender", () => {
  const src = soloCodigo(RUTA_AGENTE);

  it("⭐ el borrador siembra las tareas fijas de la Semana 0 (R7), con una fase o con todas", () => {
    /* ⚠ REAPUNTADA en E2b P5a (2026-09-25), con esta razón: contaba las DOS llamadas de las vistas
       previas de analyze (`fijasDeSemanaCeroParaPreview`, la de una fase y la de todas), que se
       borraron. La garantía vive en R7 de lib/timeline/tareas-del-detalle.ts, el único camino de las
       dos puertas y de «Regenerar» de una fase (el alcance deja pasar la fase del arranque; su
       conducta, en tareas-del-detalle.test.ts). La edición que la pone en rojo: sacar la siembra, no
       elegir la fase del arranque, o dejar de pasarle los tags del proyecto a la fusión. */
    const detalle = soloCodigo(RUTA_DETALLE);
    expect(detalle).toContain("const semanaCero = elegirFaseDeSemanaCero(");
    const iR7 = detalle.indexOf("if (semanaCero && semanaCero.id === f.id) {");
    expect(iR7, "R7 dejó de mirar la fase del arranque").toBeGreaterThan(-1);
    expect(detalle.indexOf("for (const t of tareasFijasDeSemanaCero(i.tags, base)) {", iR7), "R7 dejó de sembrar las fijas").toBeGreaterThan(iR7);
    expect(soloCodigo(RUTA_FUSION), "la fusión dejó de pasar los tags (sin ellos no hay fijas)").toContain(
      "tags: sanitizeTags(tl.project?.tags ?? []),",
    );
    expect(src, "volvió la siembra de la vista previa vieja").not.toContain("fijasDeSemanaCeroParaPreview");
  });

  it("y el borrador propone el tipo de actividad solo si la fase no tiene uno (R6)", () => {
    /* ⚠ REAPUNTADA en E2b P5a (2026-09-25), con esta razón: miraba la vista previa de todas las fases
       de analyze (`activityType: phase.activityType === null ? propuesto : null`), que se borró. El tipo
       ahora lo propone R6 de lib/timeline/tareas-del-detalle.ts, con la misma regla: solo si la fase no
       tiene uno (el elegido a mano manda). La edición que la pone en rojo: dejar de proponerlo, o
       proponerlo sobre un tipo elegido a mano. */
    const detalle = soloCodigo(RUTA_DETALLE);
    expect(detalle).toContain("const tipoPropuesto = activityTypePropuesto(raw);");
    expect(detalle, "R6 pasó a pisar el tipo elegido a mano").toMatch(
      /if \(viva && viva\.activityType === null && !conTipoEnElBorrador\.has\(f\.id\)\) \{/,
    );
    expect(src, "analyze volvió a proponer el tipo por su cuenta").not.toContain("activityTypePropuesto(");
  });

  it("⚠ aplicar escribe el tipo SOLO si la fase sigue sin uno (R6 lo propone con `desde: null`)", () => {
    /* Solo-si-null es lo que impide que una regeneración le pise al CSE el tipo que eligió a mano.
       Sacar la condición no rompe nada visible: el Gantt sigue teniendo colores — otros.
       ⚠ REAPUNTADA en E2b P5b (2026-09-25), con esta razón: miraba apply-all
       (`if (activityType && phase.activityType === null)`), que quedó como lápida. El tipo lo propone
       R6 como un cambio de la fase con `desde: null`, y aplicar compara ese `desde` con lo vivo: si el
       CSE eligió un tipo mientras tanto, choca y queda como lo dejó. La edición que la pone en rojo:
       que R6 lo proponga con otro `desde`, o que aplicar deje de comparar el `desde` de un campo. */
    const detalle = soloCodigo(RUTA_DETALLE);
    const i = detalle.indexOf("if (p?.tipoPropuesto) {");
    expect(i, "se movió el ancla de R6: revisa esta guarda").toBeGreaterThan(-1);
    const r6 = detalle.slice(i, detalle.indexOf("if (!f.existente && delAgente.length === 0)", i));
    expect(r6.length, "el tramo de R6 salió vacío").toBeGreaterThan(100);
    expect(r6).toContain('campo: "activityType",');
    expect(r6, "R6 dejó de proponer el tipo contra una fase SIN tipo").toContain("desde: null,");

    const tipo: Cambio = {
      tipo: "fase-cambia",
      clave: "fase:f1:activityType",
      faseId: "f1",
      fase: "Kick-off",
      campo: "activityType",
      desde: null,
      a: "ADOPCION",
    };
    const borrador: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 1,
      origen: "contexto",
      observaciones: [],
      cambios: [tipo],
      pedido: "regenerar",
      tareas: null,
      tareasArmadasPara: {},
    };
    const vivo = (activityType: string | null): Vivo => ({
      ancla: null,
      fases: [{ id: "f1", name: "Kick-off", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType }],
    });
    expect(planDeAplicacion(vivo(null), borrador).items[0].estado).toBe("aplica");
    const aMano = planDeAplicacion(vivo("CONFIGURACION"), borrador);
    expect(aMano.items[0].estado, "aplicar pisaría el tipo elegido a mano").toBe("choque");
    expect(aMano.marcadas).toBe(0);
  });

  it("y la trazabilidad de la corrida sobrevive al cambio de escritor", () => {
    /* ⚠ REAPUNTADA en E2b P5b (2026-09-25), con esta razón: miraba apply-all, que quedó como lápida. La
       escribe el aplicar del borrador, con la corrida que armó las tareas. La edición que la pone en
       rojo: dejar de escribir la columna al aplicar tareas nuevas. */
    expect(soloCodigo(ESCRITOR)).toContain("detailGeneratedByAgentRunId: borrador.tareas.corrida");
  });
});

describe("⛔ el escalón de permiso cuelga de que el cronograma todavía no tenga tareas de la IA", () => {
  /* ⚠ REESCRITO en E2b P5b (2026-09-25), con esta razón: miraba `guardTimelineDetailApply` y apply-all.
     apply-all quedó como lápida y ese guard, sin llamador (código muerto hasta E4). Aplicar las tareas
     de la propuesta pide `guardIaDelCronograma`, la MISMA vara que pedirlas: con tareas de la IA,
     `regenerateTimeline`; sin ellas (la primera vez), `cronograma.generate`, que Ventas y Marketing
     tienen. */
  const guards = soloCodigo(GUARDS);

  it("con tareas de la IA pide la vara del regen; la primera vez, la de generar", () => {
    /* La edición que la pone en rojo: pedir la vara del regen también la primera vez. */
    const i = guards.indexOf("export async function guardIaDelCronograma(");
    expect(i, "se movió el ancla: revisa esta guarda").toBeGreaterThan(0);
    const tramo = guards.slice(i, guards.indexOf("export async function", i + 10));
    expect(tramo.length, "el tramo salió vacío — la guarda no mira nada").toBeGreaterThan(200);
    expect(tramo, "se perdió la medición de si ya hay tareas de la IA").toMatch(/timelineTask\.count\(/);
    const iVirgen = tramo.indexOf("} else {");
    expect(iVirgen, "se perdió la rama de la primera vez").toBeGreaterThan(-1);
    expect(tramo.slice(0, iVirgen)).toContain('guardCapability("regenerateTimeline")');
    expect(tramo.slice(iVirgen), "la primera vez dejó de pedir la vara de generar").toContain(
      'guardPermission("cronograma", "generate")',
    );
    // Y esa vara es la que tienen Ventas y Marketing, que generan pero no regeneran.
    for (const rol of ["VENTAS", "MARKETING"] as const) {
      expect(DEFAULT_MATRIX[rol].sections.cronograma.generate, `${rol} perdió «generar»`).toBe(true);
    }
  });

  it("⚠ y aplicar las tareas usa ESE guard, no el de vara fija", () => {
    /* Si aplicar pidiera la vara fija del regen, Ventas y Marketing dejarían de poder crear el cronograma —
       y el síntoma sería un 403 al aplicar la propuesta, que se lee como «se rompió el permiso», no como
       «alguien cambió el guard».
       ⚠ ACTUALIZADA en E4 (2026-09), con esta razón: `guardTimelineFullRegen` se borró de api-guards.ts,
       así que negar su nombre quedaba decorativo. Queda el positivo (aplicar pide `guardIaDelCronograma`)
       y la negación de pedir la vara del regen por su cuenta. */
    const apply = soloCodigo(RUTA_APPLY);
    expect(apply).toContain("(await guardIaDelCronograma(tl.id)) === null");
    expect(apply, "aplicar pide la vara del regen por su cuenta").not.toContain('guardCapability("regenerateTimeline")');
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
