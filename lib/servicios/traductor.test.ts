import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { propuestaSchema, traducirPropuesta, tramoEnCurso, type Propuesta } from "./traductor";

const propuesta: Propuesta = {
  formato: 1,
  propuesta: "Plan de 60 días",
  tramos: [
    {
      nombre: "Corregir",
      desde: "2026-09-07",
      hasta: "2026-10-04",
      meta: "Datos limpios",
      iniciativas: [
        { titulo: "Limpiar contactos", area: "Ventas", criterio: "0 duplicados", semanas: "1-2", estado: "hecha", dimensiones: [{ dimension: "Datos", nivel: "Funcional" }] },
        {
          titulo: "Pipeline",
          area: "Ventas",
          criterio: "80 % con etapa",
          semanas: "3-4",
          estado: "en_curso",
          dependencias: [{ titulo: "Enviar las etapas", semana: 3 }],
        },
      ],
    },
    {
      nombre: "Adoptar",
      desde: "2026-10-05",
      hasta: "2026-11-01",
      iniciativas: [{ titulo: "Tablero", semanas: { desde: 2, hasta: 3 }, estado: "pendiente" }],
    },
    {
      nombre: "Crecer",
      desde: "2026-11-02",
      hasta: "2026-11-29",
      iniciativas: [{ titulo: "Chat", criterio: "50 conversaciones" }],
    },
  ],
};

describe("el tramo en curso", () => {
  const t = propuesta.tramos;
  it("el que contiene hoy; antes de empezar, el primero; después de todos, el último; entre dos, el que terminó", () => {
    expect(tramoEnCurso(t, "2026-10-17")).toBe(1);
    expect(tramoEnCurso(t, "2026-01-01")).toBe(0);
    expect(tramoEnCurso(t, "2027-01-01")).toBe(2);
    expect(tramoEnCurso([{ desde: "2026-01-01", hasta: "2026-01-31" }, { desde: "2026-03-01", hasta: "2026-03-31" }], "2026-02-10")).toBe(0);
  });
});

describe("traducir una propuesta", () => {
  const plan = traducirPropuesta(propuesta, { hoy: "2026-10-17", anclaDelCronograma: null });

  it("los tramos anteriores quedan cerrados, el en curso abierto y los siguientes al plan", () => {
    expect(plan.ancla).toBe("2026-09-07");
    expect(plan.ciclos.map((c) => [c.nombre, c.estado])).toEqual([
      ["Corregir", "cerrado"],
      ["Adoptar", "abierto"],
    ]);
    expect(plan.plan.map((c) => [c.titulo, c.tramo])).toEqual([["Chat", "Crecer"]]);
  });

  it("en el cerrado, lo hecho se cumplió y lo que no se terminó pasa al abierto, con sus dependencias", () => {
    const [cerrado, abierto] = plan.ciclos;
    expect(cerrado.decisiones).toEqual(["cumplido", "pasa"]);
    expect(abierto.casos.map((c) => c.titulo)).toEqual(["Tablero", "Pipeline"]);
    const pipeline = abierto.casos[1];
    expect(pipeline.porque).toContain("Venía del tramo «Corregir»");
    expect(pipeline).toMatchObject({ startWeek: 4, durationWeeks: 4, estadoDeLaFase: "IN_PROGRESS" });
    expect(pipeline.dependencias).toEqual([{ titulo: "Enviar las etapas", weekIndex: 0, hecha: false }]);
  });

  it("las semanas de cada iniciativa son las del tramo, sobre el ancla del cronograma", () => {
    const [cerrado, abierto] = plan.ciclos;
    expect(cerrado.casos[0]).toMatchObject({ startWeek: 0, durationWeeks: 2, estadoDeLaFase: "DONE" });
    expect(cerrado.casos[0].mueve).toEqual([{ area: "Ventas", dimension: "Datos", nivel: "Funcional" }]);
    expect(abierto.casos[0]).toMatchObject({ startWeek: 5, durationWeeks: 2, estadoDeLaFase: "PENDING" });
  });

  it("el ciclo abierto queda en Implementación si algo empezó; avisa lo que no trae criterio", () => {
    expect(plan.ciclos[1].etapa).toBe("implementacion");
    expect(plan.avisos).toContain("«Tablero» no trae criterio de aceptación: la guía del CSE lo va a pedir.");
  });

  it("con un ancla anterior, las semanas se corren sobre ella", () => {
    const otro = traducirPropuesta(propuesta, { hoy: "2026-10-17", anclaDelCronograma: "2026-08-31" });
    expect(otro.ancla).toBe("2026-08-31");
    expect(otro.ciclos[0].casos[0].startWeek).toBe(1);
  });

  it("unas semanas que no caben en el tramo se avisan y toman el tramo entero", () => {
    const p: Propuesta = { ...propuesta, tramos: [{ ...propuesta.tramos[0], iniciativas: [{ titulo: "X", criterio: "c", semanas: "9-12" }] }] };
    const r = traducirPropuesta(p, { hoy: "2026-09-10", anclaDelCronograma: null });
    expect(r.ciclos[0].casos[0]).toMatchObject({ startWeek: 0, durationWeeks: 4 });
    expect(r.avisos[0]).toContain("no caben en el tramo");
  });
});

describe("la forma de la propuesta", () => {
  it("el ejemplo del repo es válido", () => {
    const crudo = JSON.parse(readFileSync(join(process.cwd(), "scripts/data/propuesta-smartloop.ejemplo.json"), "utf8"));
    expect(propuestaSchema.safeParse(crudo).success).toBe(true);
  });

  it("tramos fuera de orden o pisados no entran", () => {
    const malo = { ...propuesta, tramos: [propuesta.tramos[1], propuesta.tramos[0]] };
    expect(propuestaSchema.safeParse(malo).success).toBe(false);
  });
});
