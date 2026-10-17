import { describe, expect, it } from "vitest";
import {
  aplicarPropuestaALaFase,
  cambiosDesdeLaAprobada,
  cronogramaDelCiclo,
  fotoParaAprobar,
  leerFotoAprobada,
  notasDeLaFase,
  propuestaPorDependencia,
  semanaDelCiclo,
  semanasDelCiclo,
  type CasoParaElCronograma,
  type FaseDelCiclo,
} from "./ciclo";

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

describe("las semanas del ciclo", () => {
  it("la semana del cronograma en la que arranca el ciclo, nunca negativa", () => {
    expect(semanaDelCiclo(ANCLA, "2026-09-07")).toBe(0);
    expect(semanaDelCiclo(ANCLA, "2026-09-21")).toBe(2);
    expect(semanaDelCiclo(ANCLA, "2026-09-23")).toBe(2);
    expect(semanaDelCiclo(ANCLA, "2026-08-01")).toBe(0);
  });

  it("cuántas semanas tiene el ciclo, inclusive, y null sin fechas", () => {
    expect(semanasDelCiclo("2026-09-01", "2026-10-30")).toBe(9); // 60 días
    expect(semanasDelCiclo("2026-09-01", "2026-09-01")).toBe(1);
    expect(semanasDelCiclo(null, "2026-09-01")).toBeNull();
  });

  it("la fase lleva el criterio de aceptación en sus notas", () => {
    expect(notasDeLaFase({ criterio: "El 80 % de los negocios con etapa", metrica: "% con etapa" })).toBe(
      "Criterio de aceptación: El 80 % de los negocios con etapa\nMétrica: % con etapa",
    );
    expect(notasDeLaFase({ criterio: null, metrica: null })).toBeNull();
  });
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
            { id: "t1", title: "Enviar la base", weekIndex: 0, status: "PENDING", party: "CLIENTE" },
            { id: "t2", title: "Aprobar el pipeline", weekIndex: 3, status: "DONE", party: "CLIENTE" },
            { id: "t3", title: "Configurar", weekIndex: 1, status: "DONE", party: "SMARTEAM" },
            { id: "t4", title: "Probar", weekIndex: 2, status: "PENDING", party: "AMBOS" },
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
    expect(a.propuesta?.semanas).toBe(1);
    expect(a.propuesta?.dependencias).toEqual(["t1"]);
  });

  it("una fase hecha no propone nada aunque tenga una dependencia vieja", () => {
    const r = cronogramaDelCiclo({
      anchor: ANCLA,
      casos: [caso("a", "f1")],
      fases: [fase("f1", { status: "DONE", startWeek: 0, tasks: [{ id: "t1", title: "x", weekIndex: 0, status: "PENDING", party: "CLIENTE" }] })],
      ahora,
    });
    expect(r.casos[0].propuesta).toBeNull();
  });
});

describe("la propuesta por una dependencia atrasada", () => {
  const ahora = new Date("2026-10-17T12:00:00Z");

  it("propone correr la fase tantas semanas como lleva atrasada la más vieja; sin atrasos, nada", () => {
    const p = propuestaPorDependencia({
      fase: { name: "Pipeline" },
      dependencias: [
        { id: "d1", titulo: "Base", vence: "2026-10-12T00:00:00.000Z", hecha: false, atrasada: true },
        { id: "d2", titulo: "Logos", vence: "2026-09-28T00:00:00.000Z", hecha: false, atrasada: true },
      ],
      ahora,
    });
    expect(p).toMatchObject({ semanas: 3, dependencias: ["d1", "d2"] });
    expect(p?.texto).toBe("2 dependencias del cliente están atrasadas: correr el fin de «Pipeline» 3 semanas.");
    expect(propuestaPorDependencia({ fase: { name: "x" }, dependencias: [], ahora })).toBeNull();
  });

  it("aplicar alarga la fase y corre solo las dependencias de la propuesta, sin salirse de la fase", () => {
    const r = aplicarPropuestaALaFase(
      {
        durationWeeks: 4,
        tasks: [
          { id: "d1", title: "a", weekIndex: 0, status: "PENDING", party: "CLIENTE" },
          { id: "d2", title: "b", weekIndex: 3, status: "PENDING", party: "CLIENTE" },
          { id: "t", title: "c", weekIndex: 1, status: "PENDING", party: "SMARTEAM" },
        ],
      },
      { semanas: 2, dependencias: ["d1", "d2"] },
    );
    expect(r).toEqual({ durationWeeks: 6, tareas: [{ id: "d1", weekIndex: 2 }, { id: "d2", weekIndex: 5 }] });
  });
});

describe("la versión aprobada", () => {
  const ahora = new Date("2026-10-17T12:00:00Z");
  const hoy = (fases: FaseDelCiclo[], casos: CasoParaElCronograma[]) => cronogramaDelCiclo({ anchor: ANCLA, casos, fases, ahora });

  it("la foto se lee de vuelta igual, y una forma rara da null", () => {
    const foto = fotoParaAprobar(hoy([fase("f1")], [caso("a", "f1")]));
    expect(leerFotoAprobada(JSON.parse(JSON.stringify(foto)))).toEqual(foto);
    expect(leerFotoAprobada({ formato: 2 })).toBeNull();
    expect(leerFotoAprobada(null)).toBeNull();
  });

  it("dice qué entró, qué salió, qué se corrió y qué criterio cambió", () => {
    const foto = fotoParaAprobar(hoy([fase("f1"), fase("f2")], [caso("a", "f1"), caso("b", "f2")]));
    const ahoraHoy = hoy(
      [fase("f1", { startWeek: 3 }), fase("f3", { tasks: [{ id: "t", title: "Base", weekIndex: 0, status: "PENDING", party: "CLIENTE" }] })],
      [caso("a", "f1", { criterio: "Otro" }), caso("c", "f3")],
    );
    expect(cambiosDesdeLaAprobada(foto, ahoraHoy)).toEqual([
      "«Caso a» pasó de S2–S5 a S3–S6.",
      "Cambió el criterio de aceptación de «Caso a».",
      "Entró «Caso c».",
      "Salió «Caso b».",
    ]);
    expect(cambiosDesdeLaAprobada(foto, hoy([fase("f1"), fase("f2")], [caso("a", "f1"), caso("b", "f2")]))).toEqual([]);
    expect(cambiosDesdeLaAprobada(null, ahoraHoy)).toEqual([]);
  });
});
