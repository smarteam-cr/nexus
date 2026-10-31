import { describe, expect, it } from "vitest";
import { cronogramaDelCiclo, type CasoParaElCronograma, type FaseDelCiclo } from "./ciclo";

const ANCLA = "2026-09-07"; // lunes

const caso = (id: string, faseId: string | null, extra: Partial<CasoParaElCronograma> = {}): CasoParaElCronograma => ({
  id,
  titulo: `Caso ${id}`,
  criterio: "Se mide",
  metrica: null,
  estado: "en_ciclo",
  faseId,
  ...extra,
});

const fase = (id: string, extra: Partial<FaseDelCiclo> = {}): FaseDelCiclo => ({
  id,
  name: `Fase ${id}`,
  durationWeeks: 4,
  startWeek: 2,
  status: "PENDING",
  tasks: [],
  ...extra,
});

describe("el cronograma del ciclo", () => {
  const ahora = new Date("2026-10-17T12:00:00Z");

  it("cada caso de uso con su fase: semanas, fechas, estado y avance; el que no tiene fase se cuenta aparte", () => {
    const r = cronogramaDelCiclo({
      anchor: ANCLA,
      casos: [caso("a", "f1"), caso("b", "f2"), caso("c", null)],
      fases: [fase("f1", { status: "DONE" }), fase("f2", { status: "IN_PROGRESS", startWeek: 4, durationWeeks: 6 })],
      ahora,
    });
    expect(r.sinFase).toBe(1);
    expect(r.avance).toEqual({ hechos: 1, total: 2 });
    const [a, b, c] = r.casos;
    expect(a).toMatchObject({ inicio: 2, fin: 6, desde: "2026-09-21", hasta: "2026-10-18", estado: "hecha", atrasado: false });
    expect(b).toMatchObject({ inicio: 4, fin: 10, estado: "en_curso", atrasado: false });
    expect(c.estado).toBe("sin_fase");
  });

  it("una fase que debía terminar y no terminó está atrasada; sin ancla no hay fechas ni atraso", () => {
    const r = cronogramaDelCiclo({ anchor: ANCLA, casos: [caso("a", "f1")], fases: [fase("f1", { startWeek: 0, durationWeeks: 2 })], ahora });
    expect(r.casos[0].atrasado).toBe(true);
    const sin = cronogramaDelCiclo({ anchor: null, casos: [caso("a", "f1")], fases: [fase("f1", { startWeek: 0, durationWeeks: 2 })], ahora });
    expect(sin.casos[0]).toMatchObject({ desde: null, hasta: null, atrasado: false });
  });

  it("las dependencias del cliente son las tareas CLIENTE de la fase; las demás cuentan como tareas de Smarteam", () => {
    const r = cronogramaDelCiclo({
      anchor: ANCLA,
      casos: [caso("a", "f1")],
      fases: [
        fase("f1", {
          startWeek: 4,
          durationWeeks: 6,
          tasks: [
            { id: "t1", title: "Enviar la base", weekIndex: 0, status: "PENDING", party: "CLIENTE", needsValidation: false },
            { id: "t2", title: "Aprobar el pipeline", weekIndex: 3, status: "DONE", party: "CLIENTE", needsValidation: false },
            { id: "t3", title: "Configurar", weekIndex: 1, status: "DONE", party: "SMARTEAM", needsValidation: false },
            { id: "t4", title: "Probar", weekIndex: 2, status: "PENDING", party: "AMBOS", needsValidation: false },
          ],
        }),
      ],
      ahora,
    });
    const a = r.casos[0];
    expect(a.tareas).toEqual({ hechas: 1, total: 2 });
    expect(a.dependencias.map((d) => [d.titulo, d.atrasada, d.hecha])).toEqual([
      ["Enviar la base", true, false],
      ["Aprobar el pipeline", false, true],
    ]);
    expect(r.dependenciasAtrasadas).toBe(1);
  });
});
