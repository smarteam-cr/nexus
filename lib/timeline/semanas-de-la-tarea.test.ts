/**
 * lib/timeline/semanas-de-la-tarea.test.ts — una tarea que dura varias semanas, en el MOTOR (2026-11-19).
 *
 * `TimelineTask.semanas` vale para todos los cronogramas: el guardado la recorta a lo que cabe en la fase, el PUT la
 * lee con tolerancia (una pantalla de antes no la manda y no la borra), y todo fin de tarea sale de `overduePlannedEnd`
 * con su duración (lo prueba weeks.test.ts). Este archivo vigila además que ningún cálculo de fin de tarea vuelva a
 * hacerse a mano con `weekIndex + 1`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semanasQueCaben } from "./weeks";
import { validateTimelinePayload } from "./validate";

describe("semanasQueCaben (toda escritura de `semanas`)", () => {
  it("conserva lo que dura, recortado al final de la fase; 1 o nada es null", () => {
    expect(semanasQueCaben(3, 4, 12)).toBe(3);
    expect(semanasQueCaben(8, 8, 12)).toBe(4);
    expect(semanasQueCaben(5, 11, 12)).toBeNull();
    expect(semanasQueCaben(null, 0, 12)).toBeNull();
    expect(semanasQueCaben(1, 0, 12)).toBeNull();
    expect(semanasQueCaben(2.5, 0, 12)).toBeNull();
  });
});

describe("el PUT del cronograma lee `semanas` con tolerancia", () => {
  const leer = (semanas: unknown) =>
    validateTimelinePayload({
      phases: [{ name: "Fase", order: 0, durationWeeks: 12, tasks: [{ title: "Tarea", weekIndex: 2, order: 0, ...(semanas === "falta" ? {} : { semanas }) }] }],
    }).parsed!.phases[0].tasks![0].semanas;

  it("un número válido pasa; 1 y null son «una semana»; lo que no viene no se toca; lo raro se ignora", () => {
    expect(leer(3)).toBe(3);
    expect(leer(1)).toBeNull();
    expect(leer(null)).toBeNull();
    expect(leer("falta")).toBeUndefined();
    expect(leer("dos")).toBeUndefined();
    expect(leer(0)).toBeUndefined();
  });
});

describe("⛔ ningún fin de tarea se calcula a mano (escaneo)", () => {
  /* Antes de las tareas de varias semanas, cada consumidor sumaba `weekIndex + 1` por su cuenta. Los que calculan el FIN
     de una tarea tienen que pasar por `overduePlannedEnd` o `ultimaSemanaDeLaTarea`, o una tarea de tres semanas se da
     por atrasada al terminar la primera. */
  const ARCHIVOS = [
    "lib/portfolio/summary.ts",
    "lib/cs/watchdog-context.ts",
    "lib/timeline/baseline.ts",
    "lib/carga/entrega.ts",
    "lib/servicios/panel-del-servicio.ts",
    "lib/tiempos/disparar.ts",
    "lib/timeline/ciclo.ts",
    "lib/timeline/client-blockers.ts",
    "lib/timeline/project-actions-input.ts",
  ];
  it.each(ARCHIVOS)("%s no suma «+ 1» a la semana de la tarea, y pasa por la duración", (rel) => {
    const texto = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    // Las formas que tenía el código de antes (todas las de estos archivos al 19 nov caían acá).
    expect(texto).not.toMatch(/\b(weekIndex|absWeek|abs|absW) \+ 1\b/);
    // Y le pasa la duración de la tarea a la cuenta (`t.semanas)`, `tarea.semanas)`…), no solo la nombra.
    expect(texto).toMatch(/\.semanas\)/);
  });
});
