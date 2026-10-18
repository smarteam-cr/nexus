import { describe, expect, it } from "vitest";
import { aniosDeLaBarra, facturadoPorMes, leerLaMeta, metasVigentes, type MetaVigente } from "./meta";
import { caminoALaMeta, lineaDePorFacturar } from "./por-facturar";

// Un dólar = 500 colones, salvo 2024, que no tiene tasa.
const aDolares = (monto: number, moneda: string, periodo: string) => (moneda === "USD" ? monto : periodo.startsWith("2024") ? null : monto / 500);

describe("facturadoPorMes y aniosDeLaBarra: lo facturado de cada año, por moneda, sin convertir en el motor", () => {
  const docs = facturadoPorMes([
    { fuente: "odoo", diaISO: "2023-03-10", moneda: "USD", monto: 1000 },
    { fuente: "odoo", diaISO: "2025-03-10", moneda: "USD", monto: 100_000 },
    { fuente: "odoo", diaISO: "2025-04-10", moneda: "USD", monto: -5000 }, // una nota de crédito resta
    { fuente: "odoo", diaISO: "2025-04-11", moneda: "CRC", monto: 5_000_000 },
    { fuente: "mercury", diaISO: "2025-05-01", moneda: "USD", monto: 20_000 },
    { fuente: "aliados", diaISO: "2025-08-15", moneda: "USD", monto: 40_000 },
    { fuente: "odoo", diaISO: "2024-06-01", moneda: "CRC", monto: 1_000_000 },
    { fuente: "odoo", diaISO: "2026-02-01", moneda: "USD", monto: 30_000 },
  ]);

  it("junta por mes, moneda y fuente, con las notas de crédito restando", () => {
    expect(docs.find((m) => m.periodo === "2025-04" && m.moneda === "USD")).toMatchObject({ monto: -5000, documentos: 1 });
  });

  it("los años del primero con datos a hoy; el del medio sin datos se dice, no se dibuja en cero", () => {
    const anios = aniosDeLaBarra(docs, "2026-10-18", aDolares);
    expect(anios.map((a) => a.anio)).toEqual([2023, 2024, 2025, 2026]);
    const a2025 = anios.find((a) => a.anio === 2025)!;
    expect(a2025.usd).toBe(100_000 - 5000 + 10_000 + 20_000 + 40_000);
    expect(a2025.usdPorFuente).toEqual({ odoo: 105_000, mercury: 20_000, aliados: 40_000 });
    expect(a2025.porMoneda.CRC).toEqual({ odoo: 5_000_000 });
    expect(anios.find((a) => a.anio === 2026)!.enCurso).toBe(true);
  });

  it("lo que no tiene tasa no se suma a ojo: queda aparte, por moneda", () => {
    const a2024 = aniosDeLaBarra(docs, "2026-10-18", aDolares).find((a) => a.anio === 2024)!;
    expect(a2024.usd).toBe(0);
    expect(a2024.sinConvertir).toEqual({ CRC: 1_000_000 });
    expect(a2024.documentos).toBe(1);
  });

  it("sin documentos no hay barras", () => {
    expect(aniosDeLaBarra([], "2026-10-18", aDolares)).toEqual([]);
  });
});

describe("la meta: la vigente es la última que se definió de su año", () => {
  const filas: MetaVigente[] = [
    { anio: 2027, montoUsd: 2_000_000, nota: null, definidaPor: "a@x", definidaAt: "2026-10-01T00:00:00Z" },
    { anio: 2027, montoUsd: 2_300_000, nota: "Marco", definidaPor: "b@x", definidaAt: "2026-10-17T00:00:00Z" },
  ];
  it("append-only: gana la más nueva", () => {
    expect(metasVigentes(filas).get(2027)!.montoUsd).toBe(2_300_000);
  });
  it("cuánto hay que crecer contra el último año completo, y por mes", () => {
    const anios = aniosDeLaBarra(facturadoPorMes([{ fuente: "odoo", diaISO: "2025-05-01", moneda: "USD", monto: 500_000 }, { fuente: "odoo", diaISO: "2026-05-01", moneda: "USD", monto: 400_000 }]), "2026-10-18", aDolares);
    const l = leerLaMeta(anios, metasVigentes(filas).get(2027)!, 120_000);
    expect(l.base).toEqual({ anio: 2025, usd: 500_000 });
    expect(l.crecimiento).toBeCloseTo(3.6);
    expect(l.porMes).toBeCloseTo(191_666.67, 1);
    expect(l.enCurso).toEqual({ anio: 2026, facturado: 400_000, porFacturar: 120_000 });
  });
});

describe("lineaDePorFacturar: de qué está hecha la línea y cuánto falta", () => {
  const meses = [
    { periodo: "2026-10", facturado: 50_000, pendienteFacturar: 20_000, futuro: false },
    { periodo: "2026-11", facturado: 0, pendienteFacturar: 30_000, futuro: true },
    { periodo: "2026-12", facturado: 0, pendienteFacturar: 10_000, futuro: true },
  ];
  const cuotas = [
    { periodo: "2026-10", modalidad: "RECURRENTE" as const, monto: 10_000 },
    { periodo: "2026-10", modalidad: "PROYECTO" as const, monto: 30_000 },
    { periodo: "2026-11", modalidad: "RECURRENTE" as const, monto: 30_000 },
  ];
  const pipeline = [
    { periodo: "2026-11", ponderado: 8000, esExpansion: true },
    { periodo: "2026-11", ponderado: 5000, esExpansion: false },
  ];
  const l = lineaDePorFacturar(meses, cuotas, pipeline, { fuente: "meta", mensual: 60_000 });

  it("cada mes suma exactamente la línea del reporte (la proporción se escala)", () => {
    for (const m of l.meses) expect(m.recurrencia + m.proyectos + m.sinDesglose).toBeCloseTo(m.porFacturar, 2);
    expect(l.meses[0]).toMatchObject({ recurrencia: 5000, proyectos: 15000 });
  });

  it("un mes con línea y sin cuotas que la expliquen queda «sin desglose»", () => {
    expect(l.meses[2]).toMatchObject({ sinDesglose: 10_000, recurrencia: 0, proyectos: 0 });
  });

  it("el pipeline va al lado, separado en expansiones y nuevos; falta = objetivo − facturado − por facturar", () => {
    expect(l.meses[1]).toMatchObject({ expansiones: 8000, nuevos: 5000, falta: 30_000 });
    expect(l.meses[0].falta).toBe(0);
    // El total de lo que falta solo cuenta los meses por venir.
    expect(l.totales.falta).toBe(30_000 + 50_000);
  });
});

describe("caminoALaMeta: la recurrencia de hoy, el pipeline y lo que falta", () => {
  it("es una cuenta: recurrencia × 12 + pipeline ponderado hasta el fin del año de la meta", () => {
    const c = caminoALaMeta({
      anio: 2027,
      meta: 2_300_000,
      recurrenciaDeLosUltimosMeses: [40_000, 50_000, 60_000],
      pipeline: [
        { periodo: "2026-12", ponderado: 100_000, esExpansion: true },
        { periodo: "2027-06", ponderado: 50_000, esExpansion: false },
        { periodo: "2028-01", ponderado: 999_999, esExpansion: true },
      ],
    });
    expect(c).toMatchObject({ recurrenciaMensual: 50_000, recurrenciaAnual: 600_000, expansiones: 100_000, nuevos: 50_000, falta: 1_550_000 });
    expect(c.recurrenciaNuevaPorMes).toBeCloseTo(129_166.67, 1);
  });
  it("nunca da un faltante negativo", () => {
    expect(caminoALaMeta({ anio: 2027, meta: 100, recurrenciaDeLosUltimosMeses: [1000], pipeline: [] }).falta).toBe(0);
  });
});
