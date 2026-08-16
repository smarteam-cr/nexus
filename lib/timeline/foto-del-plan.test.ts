import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resincronizarFotoDeFase, vivasQueYaEstabanEnLaFoto } from "./foto-del-plan";

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
