/**
 * lib/timeline/reparar-propuesta.test.ts — UN ENTERO NO TIRA EL CAMBIO ENTERO.
 *
 * Correr: `npx vitest run lib/timeline/reparar-propuesta.test.ts --project unit`.
 *
 * El caso de la tabla de abajo es REAL, medido el 2026-08-20: fusionar dos fases de Wherex costó
 * 231 segundos y $0,29 de modelo, y se perdió porque una tarea de una fase que la instrucción ni
 * mencionaba quedó en una semana que no existía.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { repararPropuesta } from "./reparar-propuesta";
import { validateTimelinePayload } from "./validate";

const fase = (over: Record<string, unknown> = {}) => ({
  name: "Reportería y Data",
  durationWeeks: 2,
  tasks: [{ title: "Construir dashboards", weekIndex: 0, order: 0 }],
  ...over,
});

describe("lo aritmético se acomoda", () => {
  it("⭐ el caso real: una tarea en la semana 2 de una fase de 2 semanas", () => {
    const crudo = {
      phases: [fase({ tasks: [{ title: "Dashboards", weekIndex: 2, order: 0 }] })],
    };
    const { propuesta, arreglos } = repararPropuesta(crudo);
    const t = (propuesta as typeof crudo).phases[0].tasks[0];
    expect(t.weekIndex, "se recorta a la última semana que existe").toBe(1);
    expect(arreglos).toHaveLength(1);
    expect(arreglos[0]).toContain("Reportería y Data");
    expect(arreglos[0]).toContain("2 semanas");
  });

  it("una semana negativa vuelve a cero", () => {
    const crudo = { phases: [fase({ tasks: [{ title: "x", weekIndex: -3, order: 0 }] })] };
    expect((repararPropuesta(crudo).propuesta as typeof crudo).phases[0].tasks[0].weekIndex).toBe(0);
  });

  it("una semana fraccionaria se trunca", () => {
    const crudo = { phases: [fase({ tasks: [{ title: "x", weekIndex: 1.7, order: 0 }] })] };
    expect((repararPropuesta(crudo).propuesta as typeof crudo).phases[0].tasks[0].weekIndex).toBe(1);
  });

  it("⚠ y lo que ya estaba bien NO se toca ni se reporta", () => {
    /* Si reportara siempre, el aviso se volvería ruido y el CSE dejaría de leerlo — que es
       exactamente cómo un aviso deja de servir para el caso que importa. */
    const crudo = { phases: [fase()] };
    const { propuesta, arreglos } = repararPropuesta(crudo);
    expect((propuesta as typeof crudo).phases[0].tasks[0].weekIndex).toBe(0);
    expect(arreglos).toEqual([]);
  });
});

describe("⛔ lo que NO es aritmético no se inventa", () => {
  it("un título vacío sigue siendo inválido", () => {
    /* La línea que no se cruza: una semana fuera de rango tiene UNA corrección sensata; un título
       vacío no. Adivinarlo sería inventar contenido de cara al cliente. */
    const crudo = { phases: [fase({ tasks: [{ title: "", weekIndex: 0, order: 0 }] })] };
    const { arreglos } = repararPropuesta(crudo);
    expect(arreglos).toEqual([]);
    expect(validateTimelinePayload(crudo).valid).toBe(false);
  });

  it("una fase sin duración utilizable se deja pasar tal cual", () => {
    /* Sin duración no hay contra qué recortar. Que lo rechace el validador, que es el único juez. */
    const crudo = { phases: [fase({ durationWeeks: 0, tasks: [{ title: "x", weekIndex: 5, order: 0 }] })] };
    const { propuesta, arreglos } = repararPropuesta(crudo);
    expect((propuesta as typeof crudo).phases[0].tasks[0].weekIndex).toBe(5);
    expect(arreglos).toEqual([]);
  });

  it("una entrada que no es propuesta vuelve intacta", () => {
    expect(repararPropuesta(null).arreglos).toEqual([]);
    expect(repararPropuesta({ nada: 1 }).arreglos).toEqual([]);
  });
});

describe("y el resultado pasa el validador de verdad", () => {
  it("⭐ lo que antes se rechazaba entero, ahora se aplica", () => {
    /* Es la prueba que cierra el círculo: el mismo payload, antes y después del reparador, contra
       el MISMO `validateTimelinePayload` que usa el PUT. */
    const crudo = () => ({
      anchorStartDate: "2026-05-19",
      phases: [
        {
          name: "Marketing Hub",
          order: 0,
          durationWeeks: 4,
          tasks: [
            { title: "Configurar formularios", weekIndex: 0, order: 0 },
            { title: "Migrar listas", weekIndex: 5, order: 1 },
          ],
        },
      ],
    });
    expect(validateTimelinePayload(crudo()).valid, "antes: el payload se rechazaba").toBe(false);
    expect(
      validateTimelinePayload(repararPropuesta(crudo()).propuesta).valid,
      "después: el mismo payload es aplicable",
    ).toBe(true);
  });
});

describe("el modificador repara ANTES de juzgar", () => {
  const RUTA = fs.readFileSync(
    path.join(RAIZ, "app/api/projects/[projectId]/timeline/assist/route.ts"),
    "utf8",
  );

  it("⛔ la reparación corre antes de la validación, no después", () => {
    /* Ese ORDEN es todo el arreglo. `rescate-progreso.ts` ya hacía este recorte, pero corre
       DESPUÉS de validar — así que en este camino no llegaba a actuar nunca.
       La edición que la pone en rojo: mover `repararPropuesta` debajo del `validateTimelinePayload`. */
    const posReparar = RUTA.indexOf("repararPropuesta(parsedRaw)");
    const posValidar = RUTA.indexOf("validateTimelinePayload(");
    expect(posReparar, "el modificador dejó de reparar").toBeGreaterThan(-1);
    expect(posReparar).toBeLessThan(posValidar);
  });

  it("⚠ y valida lo REPARADO, no el crudo", () => {
    /* El error silencioso: reparar y después validar el objeto original. Todo compila, el arreglo
       no hace nada, y la propuesta se rechaza igual. */
    expect(RUTA).toContain("validateTimelinePayload(reparacion.propuesta)");
  });

  it("⚠ y la corrida se cierra cuando la propuesta se rechaza", () => {
    /* Medido: una fila del 2026-08-20 quedó colgada en RUNNING para siempre porque este camino
       devolvía 422 sin cerrarla. `/settings/gasto-ia` contaba un intento que nunca termina.
       La edición que la pone en rojo: sacar el `marcarError` de la rama del 422. */
    const i = RUTA.indexOf("assist_invalid_proposal");
    const tramo = RUTA.slice(Math.max(0, i - 400), i);
    expect(tramo, "el 422 volvió a dejar la corrida en RUNNING").toContain("marcarError(run.id");
  });
});
