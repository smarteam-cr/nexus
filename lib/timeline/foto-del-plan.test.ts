import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resincronizarFotoDeFase, vivasQueYaEstabanEnLaFoto } from "./foto-del-plan";
import { inicioDeFaseEnLaFoto } from "./baseline";

/**
 * lib/timeline/foto-del-plan.test.ts — SI LA FOTO SE TRAGA LO NUEVO, EL ALCANCE NUNCA CRECE.
 *
 * ── EL DEFECTO, Y POR QUÉ ERA INVISIBLE ──────────────────────────────────────
 * `patchBaselinePhaseTasks` reemplazaba las tareas de una fase en la foto congelada por **las
 * vivas**, con ids nuevos incluidos. `lib/portfolio/summary.ts` cuenta como alcance agregado las
 * tareas vivas cuyo id NO está en la foto — así que la foto se las tragaba y `addedTasks` quedaba
 * en cero para siempre. Un proyecto podía duplicar su trabajo y el control de alcance decía que
 * no había crecido nada.
 *
 * No fallaba nada: el número simplemente era el número equivocado. Y esa función **no tenía ni un
 * test** hasta este archivo, que es lo que la volvía el punto más frágil del plan.
 *
 * ⚠ El motivo original del parche era real y se conserva: al regenerar una fase, las tareas
 * cambian de id aunque el trabajo sea el mismo, y sin re-sincronizar cada regeneración se vería
 * como «agregaron 12 tareas». Arreglar el falso positivo absorbiendo TODO mataba también los
 * verdaderos; la distinción correcta es por ID.
 */

const fechas = (viva: { weekIndex: number }) => ({
  plannedStart: `S${viva.weekIndex}-inicio`,
  plannedEnd: `S${viva.weekIndex}-fin`,
});

const enFoto = (id: string, weekIndex = 0, order = 0) => ({
  id,
  weekIndex,
  order,
  plannedStart: `S${weekIndex}-inicio`,
  plannedEnd: `S${weekIndex}-fin`,
});

describe("⛔ una tarea NUEVA no entra a la foto", () => {
  it("la agregada después de publicar queda fuera", () => {
    /* ES EL PUNTO. Si entra, `addedTasks` la deja de contar y el alcance excedido se vuelve
       inmedible — para siempre, porque cada regeneración posterior la reafirma. */
    const r = resincronizarFotoDeFase(
      [enFoto("t1"), enFoto("t2")],
      [
        { id: "t1", weekIndex: 0, order: 0 },
        { id: "t2", weekIndex: 0, order: 1 },
        { id: "NUEVA", weekIndex: 1, order: 0 },
      ],
      fechas,
    );
    expect(r.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("el helper de filtrado dice lo mismo", () => {
    const vivas = [
      { id: "t1", weekIndex: 0, order: 0 },
      { id: "NUEVA", weekIndex: 0, order: 1 },
    ];
    expect(vivasQueYaEstabanEnLaFoto([{ id: "t1" }], vivas).map((t) => t.id)).toEqual(["t1"]);
  });

  it("una foto VACÍA no se llena con lo vivo", () => {
    // El borde que hace que «absorbé todo» se cuele de nuevo por la puerta de atrás.
    expect(resincronizarFotoDeFase([], [{ id: "x", weekIndex: 0, order: 0 }], fechas)).toEqual([]);
  });
});

describe("⭐ lo que YA estaba se re-sincroniza (el falso positivo sigue resuelto)", () => {
  it("si la tarea se movió de semana, la foto recalcula sus fechas", () => {
    /* Sin esto volvería el problema que el parche vino a resolver: la foto quedaría con fechas
       viejas y el proyecto se vería atrasado por un movimiento que se aceptó. */
    const r = resincronizarFotoDeFase(
      [enFoto("t1", 0, 0)],
      [{ id: "t1", weekIndex: 3, order: 2 }],
      fechas,
    );
    expect(r[0]).toMatchObject({
      id: "t1",
      weekIndex: 3,
      order: 2,
      plannedStart: "S3-inicio",
      plannedEnd: "S3-fin",
    });
  });

  it("no toca los otros campos de la entrada", () => {
    // La foto guarda además título, procedencia y firmeza: son parte de la promesa, no del plan.
    const original = { ...enFoto("t1"), title: "Cargar la base", needsValidation: true };
    const [r] = resincronizarFotoDeFase(
      [original],
      [{ id: "t1", weekIndex: 1, order: 0 }],
      fechas,
    );
    expect(r.title).toBe("Cargar la base");
    expect(r.needsValidation).toBe(true);
  });
});

describe("⚠ lo prometido y después BORRADO se queda en la foto", () => {
  it("una entrada sin tarea viva sobrevive intacta", () => {
    /* Si desapareciera, «prometimos X y no lo hicimos» dejaría de poder decirse — y borrar la
       evidencia es la forma más silenciosa de que el alcance cierre siempre. */
    const r = resincronizarFotoDeFase(
      [enFoto("t1", 2, 0), enFoto("BORRADA", 5, 1)],
      [{ id: "t1", weekIndex: 2, order: 0 }],
      fechas,
    );
    expect(r.map((t) => t.id)).toEqual(["t1", "BORRADA"]);
    expect(r[1]).toMatchObject({ weekIndex: 5, plannedStart: "S5-inicio" });
  });
});

describe("el ORDEN de la foto no se reordena por lo vivo", () => {
  it("se conserva el orden del snapshot", () => {
    /* El orden es parte de lo que se prometió. Reordenarlo por lo vivo haría que un diff contra
       una publicación anterior se vea distinto sin que nadie haya movido nada. */
    const r = resincronizarFotoDeFase(
      [enFoto("a"), enFoto("b"), enFoto("c")],
      [
        { id: "c", weekIndex: 0, order: 0 },
        { id: "a", weekIndex: 0, order: 1 },
        { id: "b", weekIndex: 0, order: 2 },
      ],
      fechas,
    );
    expect(r.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("⭐ el parche del baseline USA esto, no reemplaza a mano", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/baseline.ts"), "utf8");

  it("`patchBaselinePhaseTasks` llama al re-sincronizador", () => {
    expect(src).toContain("resincronizarFotoDeFase(");
  });

  it("⚠ y NO vuelve a asignar todas las vivas de una", () => {
    /* La regresión concreta: volver a `snapshot.phases[i].tasks = buildTaskSnapshotEntries(...,
       liveTasks)`. Se lee como una simplificación —una línea en vez de doce— y devuelve el
       alcance a cero sin romper nada. */
    expect(
      /tasks\s*=\s*buildTaskSnapshotEntries\([^)]*liveTasks/.test(src),
      "el parche volvió a absorber TODAS las tareas vivas en la foto",
    ).toBe(false);
  });
});

/**
 * ── G13 · LA PROMESA NO ABSORBE EL ATRASO (2026-09-23) ──────────────────────
 * El parche calculaba el inicio de la fase regenerada con las fases VIVAS, suponiendo que la
 * estructura era la misma que al congelar. Deja de serlo apenas se acepta un cambio de estructura
 * (la fase anterior pasa de 2 a 4 semanas) y DESPUÉS se regeneran las tareas —que es justo lo que
 * hace «Regenerar todo» con reuniones: primero fases, después tareas—. Las fechas prometidas se
 * corrían con la estructura nueva y el atraso desaparecía del portafolio, sin que nada fallara.
 * La edición que la pone en rojo: volver a `computePhaseRanges(phases)[phaseIdx]` sobre las vivas.
 *
 * (Vive acá y no en baseline.test.ts: ese archivo tiene fines de línea mezclados y editarlo lo
 * normalizaba entero.)
 */
describe("G13 · el inicio de la fase sale de la FOTO, no de las fases vivas", () => {
  const foto = [
    { id: "kick", order: 0, durationWeeks: 1, startWeek: null },
    { id: "config", order: 1, durationWeeks: 2, startWeek: null },
    { id: "pruebas", order: 2, durationWeeks: 2, startWeek: null },
    { id: "paralela", order: 3, durationWeeks: 1, startWeek: 1 },
  ];

  it.each([
    ["kick", 0],
    ["config", 1],
    ["pruebas", 3],
    ["paralela", 1],
  ])("«%s» arranca en la semana %i de la foto", (id, esperado) => {
    expect(inicioDeFaseEnLaFoto(foto, id)).toBe(esperado);
  });

  it("⭐ con la fase anterior alargada en lo VIVO (2 → 4), la foto manda", () => {
    const vivas = foto.map((f) => (f.id === "config" ? { ...f, durationWeeks: 4 } : f));
    expect(inicioDeFaseEnLaFoto(vivas, "pruebas"), "control: con lo vivo daría 5").toBe(5);
    expect(inicioDeFaseEnLaFoto(foto, "pruebas"), "la promesa se corrió con la estructura nueva").toBe(3);
  });

  it("ordena por `order`, no por la posición en el JSON; fuera de la foto → null", () => {
    expect(inicioDeFaseEnLaFoto([...foto].reverse(), "pruebas")).toBe(3);
    expect(inicioDeFaseEnLaFoto(foto, "nueva-despues-de-publicar")).toBeNull();
  });

  it("⛔ `patchBaselinePhaseTasks` usa la foto y ya no las fases vivas", () => {
    const src = fs
      .readFileSync(path.join(process.cwd(), "lib/timeline/baseline.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    const i = src.indexOf("export async function patchBaselinePhaseTasks");
    expect(i, "se movió el ancla: revisa esta guarda").toBeGreaterThan(-1);
    const cuerpo = src.slice(i);
    expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(400);
    expect(cuerpo, "el parche dejó de tomar el inicio de la foto").toContain(
      "inicioDeFaseEnLaFoto(snapshot.phases",
    );
    expect(cuerpo, "el parche volvió a calcular el inicio con las fases vivas").not.toContain(
      "computePhaseRanges(phases)[phaseIdx]",
    );
    expect(cuerpo, "el parche volvió a leer las fases vivas").not.toMatch(/timelinePhase\s*\.\s*findMany\(/);
  });
});
