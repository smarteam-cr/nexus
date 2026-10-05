/**
 * lib/finanzas/tipo-cambio.test.ts — el tipo de cambio de cada día (2026-10-05).
 *
 * Lo que importa: que una respuesta rara del BCCR o de Hacienda no se lea como «no hubo tasas» (lanza o se cuenta), que
 * un día sin tasa tome la del día anterior más cercano sin cruzar más de una semana, que el promedio del mes sea de sus
 * días, y que el punto de equilibrio convierta lo que tiene fecha con la tasa de su día.
 */
import { describe, expect, it } from "vitest";
import {
  diasDelMes,
  fechaDeRespuesta,
  juntarBccr,
  leerHistoricoHacienda,
  leerHoyHacienda,
  leerSeriesBccr,
  resumenPorMes,
  tasaDelDia,
  tasasDeMesDesdeDias,
  tramos,
  type TasaDelDia,
} from "./tipo-cambio";
import { calcularEquilibrio, type EgresoDeMes, type IngresoDeMes } from "./equilibrio";

describe("leer las respuestas", () => {
  it("el BCCR: fecha → valor, sin lo que no es una tasa", () => {
    const venta = leerSeriesBccr({
      estado: true,
      mensaje: "Consulta exitosa",
      datos: [
        {
          codigoIndicador: "318",
          series: [
            { fecha: "2026-10-01", valorDatoPorPeriodo: 463.12 },
            { fecha: "2026-10-02T00:00:00", valorDatoPorPeriodo: 462.5 },
            { fecha: "2026-10-03", valorDatoPorPeriodo: null },
            { fecha: "2026-10-04", valorDatoPorPeriodo: 4.62 },
          ],
        },
      ],
    });
    expect([...venta.entries()]).toEqual([
      ["2026-10-01", 463.12],
      ["2026-10-02", 462.5],
    ]);
    const compra = new Map([["2026-10-01", 456.9]]);
    expect(juntarBccr(venta, compra)).toEqual([
      { fecha: "2026-10-01", venta: 463.12, compra: 456.9, fuente: "BCCR" },
      { fecha: "2026-10-02", venta: 462.5, compra: null, fuente: "BCCR" },
    ]);
  });

  it("el BCCR que rechaza la consulta LANZA: no es lo mismo que «no hubo tasas»", () => {
    expect(() => leerSeriesBccr({ estado: false, mensaje: "Token inválido" })).toThrow(/Token inválido/);
    expect(() => leerSeriesBccr({ estado: true })).toThrow(/sin «datos»/);
  });

  it("la tasa de hoy de Hacienda, con la forma que respondió el 2026-10-05", () => {
    expect(leerHoyHacienda({ venta: { fecha: "2026-10-05", valor: 462.08 }, compra: { fecha: "2026-10-05", valor: 455.71 } })).toEqual({
      fecha: "2026-10-05",
      venta: 462.08,
      compra: 455.71,
      fuente: "HACIENDA",
    });
    expect(() => leerHoyHacienda({ dolar: 462 })).toThrow(/otra forma/);
  });

  it("el histórico de Hacienda, en lista o dentro de «data», con números o { valor }; lo ilegible se cuenta", () => {
    const r = leerHistoricoHacienda([
      { fecha: "2019-12-02", compra: 567.12, venta: 573.36 },
      { fecha: "03/12/2019", compra: { valor: 566.9 }, venta: { valor: "573,10" } },
      { fecha: "basura", venta: 573 },
    ]);
    expect(r.tasas.map((t) => [t.fecha, t.venta, t.compra])).toEqual([
      ["2019-12-02", 573.36, 567.12],
      ["2019-12-03", 573.1, 566.9],
    ]);
    expect(r.ilegibles).toBe(1);
    expect(leerHistoricoHacienda({ data: [{ fecha: "2019-12-02", venta: 573.36 }] }).tasas).toHaveLength(1);
    expect(() => leerHistoricoHacienda({ code: 503, status: "Service unavailable" })).toThrow(/sin una lista/);
  });

  it("fechas: ISO, con hora y dd/mm/aaaa", () => {
    expect(fechaDeRespuesta("2024-12-01")).toBe("2024-12-01");
    expect(fechaDeRespuesta("2024-12-01T00:00:00")).toBe("2024-12-01");
    expect(fechaDeRespuesta("01/12/2024")).toBe("2024-12-01");
    expect(fechaDeRespuesta(20241201)).toBeNull();
  });
});

describe("qué tasa le toca", () => {
  const dias = new Map([
    ["2026-09-30", 470],
    ["2026-10-01", 463],
    ["2026-10-02", 462.5],
  ]);

  it("la del día; si no tiene, la del día anterior más cercano", () => {
    expect(tasaDelDia(dias, "2026-10-01")).toEqual({ fecha: "2026-10-01", venta: 463 });
    expect(tasaDelDia(dias, "2026-10-04")).toEqual({ fecha: "2026-10-02", venta: 462.5 });
  });

  it("no cruza más de una semana: más lejos, null (el que pregunta usa la del mes)", () => {
    expect(tasaDelDia(dias, "2026-10-09")).toEqual({ fecha: "2026-10-02", venta: 462.5 });
    expect(tasaDelDia(dias, "2026-10-10")).toBeNull();
    expect(tasaDelDia(dias, "2026-09-29")).toBeNull();
  });

  it("el mes: promedio de sus días hasta hoy, completo si cada día tiene una tasa cerca; el que viene, la última", () => {
    const lista = [
      ...diasDelMes("2026-09").map((fecha, i) => ({ fecha, venta: 470 + (i % 2) })),
      { fecha: "2026-10-01", venta: 463 },
      { fecha: "2026-10-02", venta: 462.5 },
    ];
    const m = tasasDeMesDesdeDias(lista, ["2026-08", "2026-09", "2026-10", "2026-11"], "2026-10-05");
    expect(m.has("2026-08")).toBe(false);
    expect(m.get("2026-09")).toMatchObject({ crcPorUsd: 470.5, dias: 30, completo: true, porVenir: false });
    // Octubre va al 5: el 3, el 4 y el 5 toman la del 2. Está completo hasta hoy.
    expect(m.get("2026-10")).toMatchObject({ crcPorUsd: 462.75, dias: 2, completo: true });
    expect(m.get("2026-11")).toMatchObject({ crcPorUsd: 462.5, porVenir: true });
    expect(m.get("2026-11")!.fuente).toMatch(/2 de octubre, la última conocida/);
  });

  it("un mes con un hueco de más de una semana no está completo", () => {
    const lista = [{ fecha: "2026-09-01", venta: 470 }, { fecha: "2026-09-30", venta: 471 }];
    expect(tasasDeMesDesdeDias(lista, ["2026-09"], "2026-10-05").get("2026-09")).toMatchObject({ completo: false, dias: 2 });
  });
});

describe("para el histórico", () => {
  it("cada mes con promedio, mínimo, máximo y al cierre, del más nuevo al más viejo", () => {
    const dias: TasaDelDia[] = [
      { fecha: "2026-09-29", venta: 471, compra: 465, fuente: "BCCR" },
      { fecha: "2026-09-30", venta: 470, compra: null, fuente: "BCCR" },
      { fecha: "2026-10-01", venta: 463, compra: 457, fuente: "HACIENDA" },
    ];
    expect(resumenPorMes(dias)).toEqual([
      { periodo: "2026-10", promedioVenta: 463, promedioCompra: 457, minimo: 463, maximo: 463, alCierre: 463, dias: 1 },
      { periodo: "2026-09", promedioVenta: 470.5, promedioCompra: 465, minimo: 470, maximo: 471, alCierre: 470, dias: 2 },
    ]);
  });

  it("los tramos cubren el rango sin huecos ni solapes", () => {
    expect(tramos("2026-01-01", "2026-03-05", 31)).toEqual([
      { desde: "2026-01-01", hasta: "2026-01-31" },
      { desde: "2026-02-01", hasta: "2026-03-03" },
      { desde: "2026-03-04", hasta: "2026-03-05" },
    ]);
  });
});

describe("el punto de equilibrio con la tasa del día", () => {
  const HOY = "2026-10-05";
  const egresos: EgresoDeMes[] = [
    // Una quincena pagada el 15 de septiembre, en colones.
    { periodo: "2026-09", rubro: "PLANILLA", concepto: "Planilla 1ª quincena", conceptoClave: "planilla-q1", monto: 470_000, moneda: "CRC", calidad: "MEDIDO", fechaISO: "2026-09-15" },
    // Una fila del Excel: es del mes entero, va con el promedio.
    { periodo: "2026-09", rubro: "FIJO_OPERACION", concepto: "Alquiler", conceptoClave: "alquiler", monto: 500_000, moneda: "CRC", calidad: "MEDIDO" },
  ];
  const ingresos: IngresoDeMes[] = [{ periodo: "2026-09", tipo: "COBRADO", monto: 940_000, moneda: "CRC", tipoServicio: "IMPLEMENTACION", fechaISO: "2026-09-20" }];
  const tasas = [{ periodo: "2026-09", crcPorUsd: 500, fuente: "promedio" }];

  it("lo que tiene fecha va con la tasa de su día; lo demás, con la del mes", () => {
    const r = calcularEquilibrio(egresos, ingresos, {
      anio: 2026,
      hoyISO: HOY,
      tasas,
      tasasDiarias: new Map([
        ["2026-09-15", 470],
        ["2026-09-19", 470],
      ]),
    });
    const sep = r.meses.find((m) => m.periodo === "2026-09")!;
    expect(sep.egresosPorRubro.PLANILLA).toBe(1000); // 470.000 / 470
    expect(sep.egresosPorRubro.FIJO_OPERACION).toBe(1000); // 500.000 / 500, el promedio
    expect(sep.cobrado).toBe(2000); // el 20 no tiene: toma la del 19
    expect(r.fx.convertidos).toBe(3);
    expect(r.fx.convertidosConTasaDelDia).toBe(2);
  });

  it("sin tasas diarias, todo con la del mes, como antes", () => {
    const r = calcularEquilibrio(egresos, ingresos, { anio: 2026, hoyISO: HOY, tasas });
    expect(r.meses.find((m) => m.periodo === "2026-09")!.egresosPorRubro.PLANILLA).toBe(940);
    expect(r.fx.convertidosConTasaDelDia).toBe(0);
  });
});
