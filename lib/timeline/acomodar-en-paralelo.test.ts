import { describe, expect, it } from "vitest";
import { acomodarEnParalelo, leerTipoDeFase, tipoPorNombre, type FaseParaAcomodar } from "./acomodar-en-paralelo";
import { computePhaseRanges, timelineSpan } from "./weeks";

const f = (name: string, durationWeeks: number, startWeek: number | null = null, tipo?: FaseParaAcomodar["tipo"]): FaseParaAcomodar => ({
  name,
  durationWeeks,
  startWeek,
  ...(tipo !== undefined ? { tipo } : {}),
});

/** Las semanas [inicio, fin) de cada fase, por nombre, como las dibuja el Gantt. */
const rangos = (fases: FaseParaAcomodar[]) => {
  const r = computePhaseRanges(fases);
  return Object.fromEntries(fases.map((x, i) => [x.name, [r[i].start, r[i].end]]));
};

describe("acomodarEnParalelo — el caso real (Club Amantes del Vino, handoff del 23-sep)", () => {
  /* Lo que propuso el handoff: 8 fases que suman 18 semanas; con el SDK en paralelo, 16 (hasta el 11 de
     enero). Vendido: 12 semanas sin la Semana 0, y todo listo antes del 31 de diciembre. */
  const delHandoff = [
    f("Semana 0", 1),
    f("Diagnóstico", 2),
    f("Arquitectura y planificación", 2),
    f("Desarrollo SDK / Integración", 4, 3),
    f("Configuración y migración", 4),
    f("Pruebas y ajustes", 2),
    f("Capacitación", 2),
    f("Go-live y cierre", 1),
  ];

  it("el plan del handoff duraba 16 semanas de calendario", () => {
    expect(timelineSpan(delHandoff)).toBe(16);
  });

  it("acomodado: 12 semanas, la capacitación en la segunda mitad de la configuración y las pruebas al terminarla", () => {
    const a = acomodarEnParalelo(delHandoff);
    expect(a.aplicado).toBe(true);
    expect(timelineSpan(a.fases)).toBe(12);
    expect(rangos(a.fases)).toEqual({
      "Semana 0": [0, 1],
      Diagnóstico: [1, 3],
      "Arquitectura y planificación": [3, 5],
      "Desarrollo SDK / Integración": [3, 7], // el inicio que dio la IA
      "Configuración y migración": [5, 9],
      Capacitación: [7, 9], // segunda mitad de una configuración de 4 semanas
      "Pruebas y ajustes": [9, 11], // al terminar la configuración
      "Go-live y cierre": [11, 12], // al final de todo
    });
  });

  it("deja `startWeek` explícito solo donde la contigua no daría el inicio (las cadenas en fila siguen empujándose)", () => {
    const a = acomodarEnParalelo(delHandoff);
    expect(a.fases.map((x) => [x.name, x.startWeek])).toEqual([
      ["Semana 0", null],
      ["Diagnóstico", null],
      ["Arquitectura y planificación", null],
      ["Desarrollo SDK / Integración", 3],
      ["Configuración y migración", 5],
      ["Capacitación", 7],
      ["Pruebas y ajustes", null],
      ["Go-live y cierre", null],
    ]);
  });

  it("no cambia duraciones ni nombres", () => {
    const a = acomodarEnParalelo(delHandoff);
    expect(a.fases.map((x) => `${x.name}:${x.durationWeeks}`).sort()).toEqual(delHandoff.map((x) => `${x.name}:${x.durationWeeks}`).sort());
  });
});

describe("acomodarEnParalelo — la regla", () => {
  it("la capacitación de un Hub va en la segunda mitad de la configuración de ESE Hub", () => {
    const a = acomodarEnParalelo([
      f("Semana 0", 1),
      f("Configuración Sales Hub", 2),
      f("Configuración Service Hub", 4),
      f("Capacitación Sales", 2),
      f("Capacitación Service", 2),
      f("Cierre y entrega", 1),
    ]);
    expect(rangos(a.fases)).toMatchObject({
      "Configuración Sales Hub": [1, 3],
      "Configuración Service Hub": [3, 7], // la configuración va en fila: es el mismo equipo
      "Capacitación Sales": [2, 4], // segunda mitad de Sales (semana 2 de 2)
      "Capacitación Service": [5, 7], // segunda mitad de Service
      "Cierre y entrega": [7, 8],
    });
  });

  it("la migración corre junto a la configuración, y las pruebas esperan a las dos", () => {
    const a = acomodarEnParalelo([
      f("Semana 0", 1),
      f("Configuración del portal", 3),
      f("Migración de datos", 5),
      f("Pruebas", 1),
      f("Cierre", 1),
    ]);
    expect(rangos(a.fases)).toMatchObject({
      "Configuración del portal": [1, 4],
      "Migración de datos": [1, 6],
      Pruebas: [6, 7],
      Cierre: [7, 8],
    });
  });

  it("una capacitación larga se pasa del fin de la configuración y el cierre la espera", () => {
    const a = acomodarEnParalelo([f("Semana 0", 1), f("Configuración", 2), f("Capacitación y adopción", 6), f("Cierre y entrega", 1)]);
    expect(rangos(a.fases)).toMatchObject({ Configuración: [1, 3], "Capacitación y adopción": [2, 8], "Cierre y entrega": [8, 9] });
  });

  it("el tipo que declaró la IA le gana al nombre", () => {
    const a = acomodarEnParalelo([f("Semana 0", 1), f("Base de Marketing", 3, null, "configuracion"), f("Ajustes finales", 1, null, "cierre")]);
    expect(a.aplicado).toBe(true);
    expect(rangos(a.fases)).toMatchObject({ "Base de Marketing": [1, 4], "Ajustes finales": [4, 5] });
  });

  it("con una fase sin tipo reconocible no toca nada (no sabe razonar el plan)", () => {
    const fases = [f("Semana 0", 1), f("Reportería y Dashboards", 2), f("Cierre", 1)];
    const a = acomodarEnParalelo(fases);
    expect(a.aplicado).toBe(false);
    expect(a.motivo).toContain("Reportería y Dashboards");
    expect(a.fases).toEqual(fases);
  });

  it("⛔ nunca alarga el plan: si con la regla queda más largo, se queda el de la IA (Metzger, handoff real)", () => {
    /* La IA había puesto la capacitación arrancando con la configuración (por la contigüidad tras la
       importación en paralelo): 10 semanas. Con la regla, la capacitación pasa a la segunda mitad y daban 12.
       La edición que la pone en rojo: sacar la comparación de largos al final de acomodarEnParalelo. */
    const metzger = [
      f("Semana 0", 1),
      f("Análisis y Arquitectura", 3),
      f("Configuración Sales Hub", 2),
      f("Configuración Marketing Hub", 2),
      f("Importación de Base de Datos", 1, 2),
      f("Prueba de Concepto", 1),
      f("Capacitación y Adopción", 6),
    ];
    expect(timelineSpan(metzger)).toBe(10);
    const a = acomodarEnParalelo(metzger);
    expect(a.aplicado).toBe(false);
    expect(a.motivo).toBe("acomodar alargaba el plan (10 → 12 semanas)");
    expect(a.fases).toEqual(metzger);
  });

  it("una fase que nombra dos Hubs sirve de configuración para la capacitación de cualquiera de los dos", () => {
    const a = acomodarEnParalelo([
      f("Semana 0", 1),
      f("Arquitectura", 2),
      f("Setup Sales + Service", 2),
      f("Capacitación Service", 2),
      f("Cierre y entrega", 1),
    ]);
    expect(rangos(a.fases)).toMatchObject({ "Setup Sales + Service": [3, 5], "Capacitación Service": [4, 6], "Cierre y entrega": [6, 7] });
  });

  it("un desarrollo sin inicio de la IA arranca con la configuración", () => {
    const a = acomodarEnParalelo([f("Semana 0", 1), f("Arquitectura", 1), f("Integración con SAP", 6), f("Configuración", 3), f("Cierre", 1)]);
    expect(rangos(a.fases)).toMatchObject({ "Integración con SAP": [2, 8], Configuración: [2, 5], Cierre: [8, 9] });
  });
});

describe("tipoPorNombre (solo cuando la IA no lo declaró)", () => {
  it.each([
    ["Semana 0", "arranque"],
    ["Kick-off", "arranque"],
    ["Diagnóstico", "diagnostico"],
    ["Auditoría y cierre de gaps", "diagnostico"],
    ["Arquitectura y planificación", "planificacion"],
    ["Configuración y migración", "configuracion"],
    ["Implementación de journeys", "configuracion"],
    ["Data Hub — Setup y limpieza", "configuracion"],
    ["Importación de Base de Datos", "migracion"],
    ["Desarrollo SDK / Integración", "desarrollo"],
    ["Capacitación", "capacitacion"],
    ["Capacitación y Cierre", "cierre"],
    ["QA y Go-Live", "cierre"],
    ["Pruebas y ajustes", "pruebas"],
    ["Go-live y cierre", "cierre"],
  ])("«%s» → %s", (nombre, tipo) => {
    expect(tipoPorNombre(nombre)).toBe(tipo);
  });

  it("lo que no reconoce queda sin tipo", () => {
    expect(tipoPorNombre("Reportería y Dashboards")).toBeNull();
  });

  it("lee el tipo que declara la IA con tildes o mayúsculas, y rechaza lo demás", () => {
    expect(leerTipoDeFase("Capacitación")).toBe("capacitacion");
    expect(leerTipoDeFase("PRUEBAS")).toBe("pruebas");
    expect(leerTipoDeFase("soporte")).toBeNull();
    expect(leerTipoDeFase(3)).toBeNull();
  });
});
