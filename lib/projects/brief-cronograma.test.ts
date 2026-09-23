import { describe, expect, it } from "vitest";
import { textoDeCronogramaParaBrief } from "./brief-cronograma";
import type { ProjectSummary } from "@/lib/portfolio/summary";

/**
 * lib/projects/brief-cronograma.test.ts — LO QUE NO SE PUEDE AFIRMAR, NO SE ESCRIBE.
 *
 * Este bloque entra al contexto del resumen como una FUENTE CITABLE: lo que diga acá el modelo lo
 * puede repetir con la firma «Cronograma del proyecto» y un CSE lo va a leer antes de una llamada.
 * Por eso la guarda no mira que el texto quede lindo: mira los tres silencios que tiene que
 * respetar.
 *
 *  · Sin ancla NO hay fecha de cierre — y media cartera no la tiene (medido en la Tanda J). Un
 *    «cierra el …» inventado ahí es una promesa que alguien repite en voz alta.
 *  · Con línea base DÉBIL no se afirma alcance agregado: el «extra» suele ser el detalle que se
 *    agregó al planificar, no trabajo que el cliente pidió de más. Acusarlo con un número que no
 *    se sostiene es peor que callarlo.
 *  · Sin fases no hay bloque: una fuente citable que dice «0 de 0» invita a afirmar sobre un plan
 *    que todavía no existe.
 */

const base = (over: Partial<ProjectSummary> = {}): ProjectSummary =>
  ({
    progress: { phasesDone: 2, phasesTotal: 5, tasksDone: 14, tasksTotal: 40, pct: 35 },
    overduePhases: 0,
    overdueTasks: 0,
    worstDaysLate: 0,
    worstOverduePhase: null,
    stalled: false,
    daysSinceActivity: null,
    weakBaseline: false,
    hasBaseline: true,
    scope: {
      measurable: true,
      addedPhases: 0,
      addedTasks: 0,
      weeksDelta: 0,
      attenuated: false,
      exceeded: false,
    },
    closing: { projectedISO: null, promisedISO: null, driftDays: null },
    ...over,
  }) as ProjectSummary;

describe("el cronograma, contado sin inventar", () => {
  it("sin summary no hay bloque", () => {
    expect(textoDeCronogramaParaBrief(null)).toBeNull();
  });

  it("sin fases tampoco: no se afirma sobre un plan que no existe", () => {
    const vacio = textoDeCronogramaParaBrief(
      base({ progress: { phasesDone: 0, phasesTotal: 0, tasksDone: 0, tasksTotal: 0, pct: 0 } }),
    );
    expect(vacio).toBeNull();
  });

  it("dice el avance con los dos números, no solo el porcentaje", () => {
    /* «35 %» sobre 5 fases y sobre 40 no significan lo mismo, y el modelo no puede pedir el
       denominador después. */
    const t = textoDeCronogramaParaBrief(base());
    expect(t).toContain("2 de 5 fases");
    expect(t).toContain("14 de 40 tareas");
  });

  it("⭐ sin fecha de arranque NO inventa un cierre: lo DICE", () => {
    const t = textoDeCronogramaParaBrief(base({ closing: { projectedISO: null, promisedISO: null, driftDays: null } }));
    expect(t, "se coló una fecha de cierre sin ancla").not.toMatch(/cierra el \d/);
    expect(t, "el silencio se lee como «va en fecha»").toContain("no afirmes fechas de cierre");
  });

  it("con cierre proyectado y prometido dice cuánto se corrió — y también si se adelantó", () => {
    const corrido = textoDeCronogramaParaBrief(
      base({
        closing: { projectedISO: "2026-11-14", promisedISO: "2026-10-24", driftDays: 21 },
      }),
    );
    expect(corrido).toContain("se corrió 21 días respecto de lo prometido");

    const adelantado = textoDeCronogramaParaBrief(
      base({ closing: { projectedISO: "2026-10-17", promisedISO: "2026-10-24", driftDays: -7 } }),
    );
    expect(adelantado, "un resumen que solo trae malas noticias miente").toContain(
      "se adelantó 7 días",
    );
  });

  it("⭐ con línea base DÉBIL no acusa alcance agregado", () => {
    const debil = textoDeCronogramaParaBrief(
      base({
        scope: {
          measurable: true,
          addedPhases: 3,
          addedTasks: 12,
          weeksDelta: 4,
          attenuated: true,
          exceeded: true,
        },
      }),
    );
    expect(debil, "afirmó extras sobre una foto que no los sostiene").not.toContain("se sumaron");

    const firme = textoDeCronogramaParaBrief(
      base({
        scope: {
          measurable: true,
          addedPhases: 3,
          addedTasks: 12,
          weeksDelta: 4,
          attenuated: false,
          exceeded: true,
        },
      }),
    );
    expect(firme).toContain("se sumaron 3 fase(s) y 12 tarea(s)");
  });

  it("el atraso nombra la peor fase cuando se sabe cuál es", () => {
    const t = textoDeCronogramaParaBrief(
      base({
        overduePhases: 2,
        overdueTasks: 7,
        worstOverduePhase: { name: "Marketing Hub", daysLate: 34 },
      }),
    );
    expect(t).toContain("2 fase(s) y 7 tarea(s) pasadas de fecha");
    expect(t).toContain("«Marketing Hub», 34 días");
  });

  it("⛔ nada de plata: el cronograma no sabe de cobranza", () => {
    const t = textoDeCronogramaParaBrief(
      base({
        overduePhases: 1,
        worstOverduePhase: { name: "Fase", daysLate: 3 },
        closing: { projectedISO: "2026-11-14", promisedISO: "2026-10-24", driftDays: 21 },
      }),
    );
    expect(t).not.toMatch(/USD|\$|factur|cobr/i);
  });
});
