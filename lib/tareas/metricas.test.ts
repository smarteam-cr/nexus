import { describe, expect, it } from "vitest";
import { metricasDeLaSemana, type TareaParaMetricas } from "./metricas";

const tarea = (t: Partial<TareaParaMetricas>): TareaParaMetricas => ({ origen: "mano", estado: "pendiente", decision: null, enLaSemana: true, creadaEnLaSemana: true, ...t });

describe("metricasDeLaSemana", () => {
  it("cumplimiento = hechas sobre lo respondido; sin respuestas no hay porcentaje", () => {
    const m = metricasDeLaSemana(
      [
        { resultado: "hecha", fotoAmbitoNombre: "Colby" },
        { resultado: "hecha", fotoAmbitoNombre: "Colby" },
        { resultado: "pasa", fotoAmbitoNombre: "Colby" },
        { resultado: "no_se_hara", fotoAmbitoNombre: null },
      ],
      [tarea({}), tarea({ estado: "hecha" })],
    );
    expect(m.revision).toEqual({ hechas: 2, siguen: 1, masAdelante: 0, noSeHaran: 1, sinMarcar: 1, cumplimiento: 50 });
    expect(m.porCliente).toEqual([{ nombre: "Colby", hechas: 2 }]);
    expect(metricasDeLaSemana([], []).revision.cumplimiento).toBeNull();
  });

  it("cómo entran no cuenta propuestas ni vencidas; lo de las reuniones dice qué se decidió", () => {
    const m = metricasDeLaSemana([], [
      tarea({ origen: "reunion", decision: "tal_cual" }),
      tarea({ origen: "reunion", decision: "con_cambios" }),
      tarea({ origen: "reunion", estado: "rechazada", decision: "rechazada" }),
      tarea({ origen: "reunion", estado: "propuesta" }),
      tarea({ origen: "notas", estado: "vencida", decision: "vencida" }),
      tarea({ origen: "mano" }),
      tarea({ origen: "mano", creadaEnLaSemana: false }),
    ]);
    expect(m.comoEntran).toEqual([
      { origen: "reunion", nombre: "De una reunión", cuantas: 3 },
      { origen: "mano", nombre: "A mano", cuantas: 1 },
    ]);
    expect(m.propuestasDeReuniones).toEqual({ total: 5, talCual: 1, conCambios: 1, descartadas: 1, eraOtra: 0, vencidas: 1, sinDecidir: 1 });
  });
});
