/**
 * lib/finanzas/tipo-cambio.test.ts — el tipo de cambio de cada día (2026-10-05).
 *
 * Lo que importa: que una respuesta rara del BCCR o de Hacienda no se lea como «no hubo tasas» (lanza o se cuenta), que
 * un día sin tasa tome la del día anterior más cercano sin cruzar más de una semana, que el promedio del mes sea de sus
 * días, y que el punto de equilibrio convierta lo que tiene fecha con la tasa de su día.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  corrigeLoGuardado,
  diasDelMes,
  fechaDeRespuesta,
  juntarBccr,
  leerHistoricoHacienda,
  leerHoyHacienda,
  leerSeriesBccr,
  mensajeDeActualizacion,
  resumenPorMes,
  tasaDelDia,
  tasasDeMesDesdeDias,
  tramos,
  type TasaDelDia,
} from "./tipo-cambio";
import { calcularEquilibrio, type EgresoDeMes, type IngresoDeMes } from "./equilibrio";
import { cargarTasasDelAnio, leerHistorico, sincronizarTipoDeCambio, tasaFirme, type TasaDelMesParaReporte } from "./tipo-cambio-server";
import { leerDecisionAliados } from "./decisiones-server";

// La base, simulada: lo de servidor (tipo-cambio-server.ts, decisiones-server.ts) se prueba sin Postgres.
const { db } = vi.hoisted(() => ({
  db: {
    tipoCambioDia: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    tipoCambioMes: { findMany: vi.fn() },
    decisionFinanzas: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

beforeEach(() => {
  for (const tabla of Object.values(db)) for (const fn of Object.values(tabla)) fn.mockReset();
});

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

// ── Auditoría 2026-10-05 ────────────────────────────────────────────────────────

describe("el número del BCCR manda (Q7)", () => {
  it("Hacienda no pisa un número que vino del BCCR; el BCCR sí lo corrige; lo que no cambió no se toca", () => {
    const delBccr = { venta: 462.08, compra: 455.71, fuente: "BCCR" };
    expect(corrigeLoGuardado(delBccr, { venta: 463, compra: 456, fuente: "HACIENDA" })).toBe(false);
    expect(corrigeLoGuardado(delBccr, { venta: 463, compra: 456, fuente: "BCCR" })).toBe(true);
    expect(corrigeLoGuardado({ ...delBccr, fuente: "HACIENDA" }, { venta: 463, compra: null, fuente: "HACIENDA" })).toBe(true);
    expect(corrigeLoGuardado(delBccr, { venta: 462.08, compra: 455.71, fuente: "BCCR" })).toBe(false);
    // Solo la compra: también es una corrección, si viene; si no viene, no borra la guardada.
    expect(corrigeLoGuardado(delBccr, { venta: 462.08, compra: 456, fuente: "BCCR" })).toBe(true);
    expect(corrigeLoGuardado(delBccr, { venta: 462.08, compra: null, fuente: "BCCR" })).toBe(false);
  });

  const manual = (registradoPor: string) => ({ crcPorUsd: 500, fuente: "a mano", registradoPor, registradoEn: new Date("2026-10-01T12:00:00Z") });
  const bccr = (completo: boolean, porVenir = false) => ({ periodo: "2026-09", crcPorUsd: 470.5, dias: 30, completo, porVenir, fuente: "BCCR" });
  const mes = (b: ReturnType<typeof bccr> | null, m: ReturnType<typeof manual> | null): TasaDelMesParaReporte => ({
    periodo: "2026-09",
    crcPorUsd: (b ?? m)?.crcPorUsd ?? 0,
    fuente: "x",
    bccr: b,
    manual: m,
  });

  it("tasaFirme: con días del BCCR manda el BCCR (completo y no por venir); sin días, la firmada por una persona", () => {
    expect(tasaFirme(undefined)).toBe(false);
    expect(tasaFirme(mes(bccr(true), null))).toBe(true);
    // Un mes del BCCR al que le faltan días ES firme si lo confirmó una persona (decisión de Elías, 2026-10-05: «si al
    // Banco Central le faltan días de un mes, Alex puede cerrarlo confirmando él la tasa»). Uno de un script, no.
    expect(tasaFirme(mes(bccr(false), manual("alex@smarteamcr.com")))).toBe(true);
    expect(tasaFirme(mes(bccr(false), manual("script:cargar-tipo-cambio")))).toBe(false);
    expect(tasaFirme(mes(bccr(false), null))).toBe(false);
    expect(tasaFirme(mes(bccr(true, true), null))).toBe(false);
    expect(tasaFirme(mes(null, manual("alex@smarteamcr.com")))).toBe(true);
    expect(tasaFirme(mes(null, manual("script:cargar-tipo-cambio")))).toBe(false);
    expect(tasaFirme(mes(null, null))).toBe(false);
  });

  it("D2 · con días que faltan, la tasa del año es la que confirmó una persona; con el mes completo, la del BCCR", async () => {
    const diasDe = (n: number) => Array.from({ length: n }, (_, i) => ({ fecha: `2026-09-${String(31 - n + i).padStart(2, "0")}`, venta: 470 }));
    const manualDe = (registradoPor: string) => [
      { periodo: "2026-09", crcPorUsd: 480, fuente: "a mano", registradoPor, registradoEn: new Date("2026-10-05T15:00:00Z") },
    ];
    const usada = async () => (await cargarTasasDelAnio(2026, "2026-10-05")).tasas.find((t) => t.periodo === "2026-09")?.crcPorUsd;

    db.tipoCambioDia.findMany.mockResolvedValue(diasDe(11));
    db.tipoCambioMes.findMany.mockResolvedValue(manualDe("alex@smarteamcr.com"));
    expect(await usada(), "Alex confirmó la tasa de un mes incompleto y el año sigue con el promedio parcial").toBe(480);

    db.tipoCambioMes.findMany.mockResolvedValue(manualDe("script:cargar-tipo-cambio"));
    expect(await usada(), "un script no le gana al BCCR").toBe(470);

    db.tipoCambioDia.findMany.mockResolvedValue(diasDe(30));
    db.tipoCambioMes.findMany.mockResolvedValue(manualDe("alex@smarteamcr.com"));
    expect(await usada(), "con el mes completo manda el BCCR").toBe(470);
  });

  it("«firmado por una persona» es la regla del cierre (confirmadoPorPersona), no una copia", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/finanzas/tipo-cambio-server.ts"), "utf8");
    const desde = src.indexOf("export function tasaFirme");
    const cuerpo = src.slice(desde, src.indexOf("\n}", desde));
    expect(desde, "no se encontró tasaFirme").toBeGreaterThan(-1);
    expect(cuerpo, "tasaFirme no usa confirmadoPorPersona: la regla está copiada").toContain("confirmadoPorPersona(");
    expect(cuerpo, "tasaFirme repite la regla del @ en vez de usar la del cierre").not.toMatch(/includes\("@"\)/);
  });
});

describe("lo que dice «Actualizar» (6)", () => {
  it("«Ya estaba al día» solo si todas las fuentes respondieron", () => {
    expect(mensajeDeActualizacion({ ok: true, nuevos: 0, corregidos: 0, avisos: [] })).toEqual({ tipo: "exito", texto: "Ya estaba al día." });
    expect(mensajeDeActualizacion({ ok: true, nuevos: 3, corregidos: 1, avisos: [] })).toEqual({ tipo: "exito", texto: "3 días nuevos, 1 corregido." });
  });

  it("si alguna fuente falló es un aviso que la nombra, nunca un éxito, aunque haya tasa de la semana", () => {
    const sinNada = mensajeDeActualizacion({ ok: true, nuevos: 0, corregidos: 0, avisos: ["El histórico de Hacienda: respondió 503"] });
    expect(sinNada.tipo).toBe("aviso");
    expect(sinNada.texto).not.toMatch(/al día/);
    expect(sinNada.texto).toContain("El histórico de Hacienda: respondió 503");
    expect(mensajeDeActualizacion({ ok: true, nuevos: 1, corregidos: 0, avisos: ["La tasa de hoy de Hacienda: respondió 503"] })).toEqual({
      tipo: "aviso",
      texto: "1 día nuevo, pero no todas las fuentes respondieron. La tasa de hoy de Hacienda: respondió 503.",
    });
  });

  it("sin ninguna tasa de la semana es un error que dice qué falló", () => {
    const r = mensajeDeActualizacion({ ok: false, nuevos: 0, corregidos: 0, avisos: ["El servicio del BCCR: no respondió", "La tasa de hoy de Hacienda: respondió 503"] });
    expect(r.tipo).toBe("error");
    expect(r.texto).toBe(
      "No hay ninguna tasa de la última semana. El servicio del BCCR: no respondió · La tasa de hoy de Hacienda: respondió 503. Prueba de nuevo en un rato.",
    );
    expect(mensajeDeActualizacion({ ok: false, nuevos: 0, corregidos: 0, avisos: [] }).texto).toMatch(/Ninguna fuente respondió/);
  });
});

describe("solo se traga la tabla o la columna que falta (13)", () => {
  const caida = Object.assign(new Error("Can't reach database server at `db:5432`"), { code: "P1001" });
  const sinTabla = Object.assign(new Error("The table `public.TipoCambioDia` does not exist in the current database."), { code: "P2021" });
  const sinColumna = Object.assign(new Error("The column `DecisionFinanzas.nota` does not exist in the current database."), { code: "P2022" });
  let silencio: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    silencio = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => silencio.mockRestore());

  it("las tasas del año: con la base caída LANZA; sin la tabla diaria, sigue con las de cada mes", async () => {
    db.tipoCambioMes.findMany.mockResolvedValue([
      { periodo: "2026-09", crcPorUsd: 500, fuente: "a mano", registradoPor: "alex@smarteamcr.com", registradoEn: new Date("2026-10-01T12:00:00Z") },
    ]);
    db.tipoCambioDia.findMany.mockRejectedValueOnce(caida);
    await expect(cargarTasasDelAnio(2026, "2026-10-05"), "un P1001 se leyó como «no hay tasas diarias»").rejects.toMatchObject({ code: "P1001" });
    db.tipoCambioDia.findMany.mockRejectedValueOnce(sinTabla);
    const r = await cargarTasasDelAnio(2026, "2026-10-05");
    expect(r.tasas).toEqual([{ periodo: "2026-09", crcPorUsd: 500, fuente: "a mano" }]);
  });

  it("el histórico de la página: con la base caída LANZA; sin la tabla, null (la página dice que falta)", async () => {
    db.tipoCambioDia.findMany.mockRejectedValueOnce(caida);
    await expect(leerHistorico()).rejects.toMatchObject({ code: "P1001" });
    db.tipoCambioDia.findMany.mockRejectedValueOnce(sinTabla);
    await expect(leerHistorico()).resolves.toBeNull();
  });

  it("la decisión sobre los aliados: con la base caída LANZA; sin la columna, «sin decidir»", async () => {
    db.decisionFinanzas.findUnique.mockRejectedValueOnce(caida);
    await expect(leerDecisionAliados(), "un P1001 se leyó como «sin decidir»").rejects.toMatchObject({ code: "P1001" });
    db.decisionFinanzas.findUnique.mockRejectedValueOnce(sinColumna);
    await expect(leerDecisionAliados()).resolves.toBeNull();
  });
});

describe("el candado de «Actualizar» (C6)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("dos pedidos a la vez hacen UNA tanda a las fuentes y reciben el mismo resultado; terminada, se suelta", async () => {
    vi.stubEnv("BCCR_TOKEN", "");
    db.tipoCambioDia.findFirst.mockImplementation(async (q: { orderBy: { fecha: string } }) => ({
      fecha: q.orderBy.fecha === "asc" ? "2023-01-01" : "2026-10-04",
    }));
    // El 1 de octubre ya está guardado con el número del BCCR.
    db.tipoCambioDia.findMany.mockResolvedValue([{ fecha: "2026-10-01", venta: 470.5, compra: 465, fuente: "BCCR" }]);
    db.tipoCambioDia.createMany.mockResolvedValue({ count: 1 });
    db.tipoCambioDia.update.mockResolvedValue({});
    db.tipoCambioDia.count.mockResolvedValue(1);
    const fuentes = vi.fn(async (url: string) => {
      await new Promise((r) => setTimeout(r, 5));
      const cuerpo = url.includes("historico")
        ? [{ fecha: "2026-10-01", venta: 470, compra: 464 }]
        : { venta: { fecha: "2026-10-05", valor: 462.08 }, compra: { fecha: "2026-10-05", valor: 455.71 } };
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fuentes);

    const [a, b] = await Promise.all([sincronizarTipoDeCambio(), sincronizarTipoDeCambio()]);
    expect(fuentes, "cada pedido arrancó su propia tanda: sin candado").toHaveBeenCalledTimes(2); // el histórico y la de hoy, una vez
    expect(a).toBe(b);
    // Hacienda trajo otro número para un día que ya tenía el del BCCR: no lo pisó.
    expect(db.tipoCambioDia.update).not.toHaveBeenCalled();

    await sincronizarTipoDeCambio();
    expect(fuentes, "el candado no se soltó al terminar").toHaveBeenCalledTimes(4);
  });
});
