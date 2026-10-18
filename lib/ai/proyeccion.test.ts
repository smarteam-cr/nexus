import { describe, expect, it } from "vitest";
import {
  ESCENARIO_DE_HOY,
  escenarioValido,
  fraccionDeAhorro,
  fraccionDeLaCacheDelPrompt,
  fraccionDelPrefijoCompartido,
  mesSiguiente,
  proyectar,
  type BaseDeCalculo,
} from "./proyeccion";

/**
 * lib/ai/proyeccion.test.ts — LA PROYECCIÓN ES UNA CUENTA, Y TIENE QUE DAR LA CUENTA.
 *
 * El modo de falla que importa: un escenario que no mueve nada (y la persona cree que lo movió), una palanca de ahorro
 * que se aplica dos veces o donde no corresponde, o un mes que se salta.
 */

const BASE: BaseDeCalculo = {
  primerMes: "2026-11",
  proyectosActivos: 50,
  hechosPrendidosHoy: false,
  ultimoMesCompleto: { mes: "2026-09", costo: 33 },
  componentes: [
    { clave: "reuniones", nombre: "Leer cada reunión", unidad: "reunión", costoUnitario: 0.2, volumenMensual: 200, escala: "reuniones", deDondeSale: "" },
    { clave: "hechos", nombre: "Hechos", unidad: "reunión", costoUnitario: 0.06, volumenMensual: 200, escala: "reuniones", deDondeSale: "" },
    { clave: "vigia", nombre: "Vigía", unidad: "corrida", costoUnitario: 0.05, volumenMensual: 100, escala: "proyectos", deDondeSale: "" },
    { clave: "resto", nombre: "Resto", unidad: "mes", costoUnitario: 30, volumenMensual: 1, escala: "clientes", deDondeSale: "" },
  ],
  ahorros: { modelosBaratos: 0.25, lotesReuniones: 0.1, lotesVigia: 0.4, cacheVigia: 0.15, prefijoCompartido: 0.4 },
};

describe("⭐ el escenario de hoy repite lo medido", () => {
  it("6 meses iguales: 40 de reuniones + 5 del vigía + 30 del resto, sin los hechos apagados", () => {
    const p = proyectar(BASE, ESCENARIO_DE_HOY(BASE));
    expect(p.meses.map((m) => m.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
    for (const m of p.meses) {
      expect(m.total).toBeCloseTo(75, 10);
      expect(m.porComponente.hechos).toBe(0);
      expect(m.sinAhorros).toBeCloseTo(m.total, 10);
    }
    expect(p.total).toBeCloseTo(450, 10);
    expect(p.ahorro).toBeCloseTo(0, 10);
  });

  it("prender los hechos suma su costo por reunión", () => {
    const p = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), hechos: true });
    expect(p.meses[0].porComponente.hechos).toBeCloseTo(12, 10);
  });
});

describe("⭐ los escenarios mueven lo que dicen", () => {
  it("+50 % de clientes escala todo; más reuniones solo lo que va por reunión", () => {
    const masClientes = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), clientesPct: 50 }).meses[0];
    expect(masClientes.total).toBeCloseTo(75 * 1.5, 10);
    const masReuniones = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), reunionesPct: 100 }).meses[0];
    expect(masReuniones.porComponente.reuniones).toBeCloseTo(80, 10);
    expect(masReuniones.porComponente.vigia).toBeCloseTo(5, 10);
    expect(masReuniones.porComponente.resto).toBeCloseTo(30, 10);
  });

  it("el crecimiento mensual se compone", () => {
    const p = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), crecimientoMensualPct: 10, meses: 3 });
    expect(p.meses[2].total).toBeCloseTo(75 * 1.21, 10);
  });

  it("los servicios recurrentes suman reuniones y proyectos al vigía", () => {
    const m = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), serviciosRecurrentes: 10, reunionesPorRecurrente: 4 }).meses[0];
    // 40 reuniones de más × US$0,20 = 8; 10 proyectos de 50 = +20 % del vigía = 1.
    expect(m.porComponente.reuniones).toBeCloseTo(48, 10);
    expect(m.porComponente.vigia).toBeCloseTo(6, 10);
  });
});

describe("⭐ los ahorros se aplican una vez y solo donde tocan", () => {
  it("Haiku y lotes en las reuniones se componen, no se suman", () => {
    expect(fraccionDeAhorro("reuniones", BASE.ahorros, { modelosBaratos: true, lotes: true, cache: false })).toBeCloseTo(1 - 0.75 * 0.9, 10);
  });

  it("el prefijo compartido solo toca los hechos y la caché del vigía solo el vigía", () => {
    expect(fraccionDeAhorro("reuniones", BASE.ahorros, { modelosBaratos: false, lotes: false, cache: true })).toBe(0);
    expect(fraccionDeAhorro("hechos", BASE.ahorros, { modelosBaratos: false, lotes: false, cache: true })).toBe(0.4);
    expect(fraccionDeAhorro("resto", BASE.ahorros, { modelosBaratos: true, lotes: true, cache: true })).toBe(0);
  });

  it("el ahorro de la proyección es la diferencia con el mismo mes sin palancas", () => {
    const p = proyectar(BASE, { ...ESCENARIO_DE_HOY(BASE), modelosBaratos: true, meses: 3 });
    expect(p.ahorro).toBeCloseTo(3 * 40 * 0.25, 10);
  });
});

describe("las fracciones salen de los tokens", () => {
  it("prefijo compartido: 11.000 tokens de reunión en Sonnet ahorran US$0,0215 de US$0,06", () => {
    // 11k × 3/M × (1 − 0,1 − 0,25) = 0,02145.
    expect(fraccionDelPrefijoCompartido({ tokensReunion: 11_000, precioEntrada: 3, costoHechos: 0.06 })).toBeCloseTo(0.02145 / 0.06, 6);
  });

  it("la caché del prompt del vigía: 2.000 tokens en tandas de 10", () => {
    // sin: 20.000; con: 2.500 + 1.800 = 4.300 → 1.570 por corrida × 3/M = 0,00471 de 0,044.
    expect(fraccionDeLaCacheDelPrompt({ tokensPrompt: 2_000, precioEntrada: 3, costoPorCorrida: 0.044, llamadasPorTanda: 10 })).toBeCloseTo(0.00471 / 0.044, 6);
  });

  it("una sola llamada por tanda no ahorra: paga el recargo de escribir", () => {
    expect(fraccionDeLaCacheDelPrompt({ tokensPrompt: 2_000, precioEntrada: 3, costoPorCorrida: 0.044, llamadasPorTanda: 1 })).toBe(0);
  });
});

describe("lo que el escenario no puede romper", () => {
  it("los meses van de 3 a 6 y los porcentajes tienen piso", () => {
    expect(escenarioValido({ ...ESCENARIO_DE_HOY(BASE), meses: 12, clientesPct: -400 })).toMatchObject({ meses: 6, clientesPct: -90 });
    expect(escenarioValido({ ...ESCENARIO_DE_HOY(BASE), meses: 1 }).meses).toBe(3);
    expect(escenarioValido({ ...ESCENARIO_DE_HOY(BASE), clientesPct: Number.NaN }).clientesPct).toBe(0);
  });

  it("el mes siguiente cruza el año", () => {
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesSiguiente("2026-10", 3)).toBe("2027-01");
  });
});
