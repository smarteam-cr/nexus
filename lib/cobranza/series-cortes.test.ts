/**
 * lib/cobranza/series-cortes.test.ts — LOS CORTES APUNTAN A SU FECHA REAL Y SOLO SE COMPARAN LOS QUE SE CORRESPONDEN.
 *
 * Hasta el 2026-09-12 el corte quincenal proyectaba a +7 días, arrancaba su ventana en la fecha UTC
 * del corte anterior, y «Cobrado vs proyectado» comparaba cualquier corte con el anterior: con el
 * corte del 24-jul (criterio 2) y el primero automático (criterio 3), el gráfico iba a nacer
 * comparando una proyección de una semana con cincuenta días de cobrado.
 *
 * Correr: `npx vitest run lib/cobranza/series-cortes.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { MetricasCartera, MetricasMoneda } from "./engine";
import { corteVencido, esDiaDeCorte, proximoDiaDeCorteISO } from "./antiguedad";
import {
  correspondeAlAnterior,
  cortesComparables,
  inicioDeVentanaISO,
  serieCobradoVsProyectado,
  type CorteDeLaSerie,
} from "./series-cortes";

const moneda = (cobrado: number, proyectado: number): MetricasMoneda => ({
  totalVencido: 0,
  totalPorCobrar: 0,
  totalProgramado: 0,
  totalSinFacturar: 0,
  nSinFacturar: 0,
  totalCobradoDesdeUltimoCorte: cobrado,
  aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 },
  dso: null,
  diasPromedioCobro: null,
  proyectadoProximoCorte: proyectado,
});

function corte(
  version: MetricasCartera["version"],
  ventana: MetricasCartera["ventana"],
  usd: { cobrado: number; proyectado: number },
): CorteDeLaSerie {
  return {
    capturedAt: `${ventana.hastaISO}T13:00:00.000Z`,
    metricas: {
      version,
      ventana,
      moneda: { CRC: moneda(0, 0), USD: moneda(usd.cobrado, usd.proyectado) },
      cuentasRojas: 0,
      cuentasAmarillas: 0,
      cobertura: { cuentasTotales: 0, cuentasConfiguradas: 0, cuentasPendienteDatos: 0, cuentasSinCobros: 0 },
    },
  };
}

/* Los tres cortes del plan: el único que había (24-jul, criterio 2, proyectado a +7) y los dos
   primeros automáticos con la regla nueva. */
const julio = corte(2, { desdeISO: null, hastaISO: "2026-07-24", proximoCorteISO: "2026-07-31" }, { cobrado: 0, proyectado: 9_000 });
const quinceSep = corte(3, { desdeISO: "2026-07-24", hastaISO: "2026-09-15", proximoCorteISO: "2026-10-01" }, { cobrado: 40_000, proyectado: 12_000 });
const unoOct = corte(3, { desdeISO: "2026-09-15", hastaISO: "2026-10-01", proximoCorteISO: "2026-10-15" }, { cobrado: 10_500, proyectado: 8_000 });

describe("serieCobradoVsProyectado", () => {
  it("24-jul (v2), 15-sep (v3) y 1-oct (v3) dan [nada, nada, valor]", () => {
    /* La edición que lo pone en rojo: volver a comparar cada corte con el anterior sin preguntar si
       se corresponden — el 15-sep mostraría 9.000 proyectados a una semana contra 40.000 de 53 días. */
    const r = serieCobradoVsProyectado([julio, quinceSep, unoOct], "USD");
    expect(r.proyectado).toEqual([null, null, 12_000]);
    expect(r.cobrado).toEqual([null, null, 10_500]);
  });

  it("si falta un corte, el siguiente no se compara con una proyección que apuntaba a otro día", () => {
    const unoNov = corte(3, { desdeISO: "2026-10-01", hastaISO: "2026-11-01", proximoCorteISO: "2026-11-15" }, { cobrado: 20_000, proyectado: 0 });
    expect(serieCobradoVsProyectado([unoOct, unoNov], "USD").proyectado).toEqual([null, null]);
    expect(correspondeAlAnterior(quinceSep, unoOct)).toBe(true);
    expect(correspondeAlAnterior(unoOct, unoNov)).toBe(false);
  });

  it("que la proyección termine en este corte no alcanza: hace falta el mismo criterio y la ventana arrancando en el anterior", () => {
    /* La edición que lo pone en rojo: dejar solo la comparación de fechas. Un corte con otro criterio,
       o uno cuya ventana arranca en un corte que la serie no trae, mide otra cosa. */
    const quinceSepOtroCriterio = corte(2, quinceSep.metricas.ventana, { cobrado: 40_000, proyectado: 12_000 });
    expect(correspondeAlAnterior(quinceSepOtroCriterio, unoOct), "otro criterio").toBe(false);
    const unoOctDesdeOtroCorte = corte(3, { desdeISO: "2026-09-20", hastaISO: "2026-10-01", proximoCorteISO: "2026-10-15" }, { cobrado: 6_000, proyectado: 0 });
    expect(correspondeAlAnterior(quinceSep, unoOctDesdeOtroCorte), "la ventana arranca en un corte del 20-sep").toBe(false);
  });

  it("un corte a mano el 12-sep se corresponde con el automático del 15, no con el del 1", () => {
    const unoSep = corte(3, { desdeISO: "2026-08-15", hastaISO: "2026-09-01", proximoCorteISO: "2026-09-15" }, { cobrado: 0, proyectado: 7_000 });
    const aMano = corte(3, { desdeISO: "2026-09-01", hastaISO: "2026-09-12", proximoCorteISO: "2026-09-15" }, { cobrado: 3_000, proyectado: 5_000 });
    const quince = corte(3, { desdeISO: "2026-09-12", hastaISO: "2026-09-15", proximoCorteISO: "2026-10-01" }, { cobrado: 4_000, proyectado: 0 });
    const r = serieCobradoVsProyectado([unoSep, aMano, quince], "USD");
    expect(r.proyectado, "el 1-sep apuntaba al 15, no al 12").toEqual([null, null, 5_000]);
    expect(r.cobrado).toEqual([null, null, 4_000]);
  });
});

describe("cortesComparables", () => {
  it("vencido, aging y DSO se dibujan solo con los cortes del criterio del último", () => {
    expect(cortesComparables([julio, quinceSep, unoOct])).toEqual([quinceSep, unoOct]);
    expect(cortesComparables([julio])).toEqual([julio]);
    expect(cortesComparables([])).toEqual([]);
  });
});

describe("inicioDeVentanaISO", () => {
  it("un corte guardado el 25-jul a las 03:49 UTC arranca la ventana siguiente el 24-jul", () => {
    /* 03:49 UTC es 21:49 del 24 en Costa Rica. Con el día UTC, lo cobrado el 25 quedaba afuera. */
    expect(inicioDeVentanaISO({ capturedAt: new Date("2026-07-25T03:49:00Z"), metricas: null })).toBe("2026-07-24");
  });

  it("si el corte anterior guardó su hastaISO, manda ese; uno mal formado no", () => {
    expect(inicioDeVentanaISO({ capturedAt: "2026-07-25T03:49:00.000Z", metricas: { ventana: { hastaISO: "2026-07-24" } } })).toBe("2026-07-24");
    expect(inicioDeVentanaISO({ capturedAt: "2026-09-15T13:00:00.000Z", metricas: { ventana: { hastaISO: "ayer" } } })).toBe("2026-09-15");
  });

  it("sin corte anterior no hay ventana", () => {
    expect(inicioDeVentanaISO(null)).toBeNull();
  });
});

describe("proximoDiaDeCorteISO", () => {
  it("12-sep da 15-sep, 15-sep da 1-oct y 20-dic da 1-ene", () => {
    expect(proximoDiaDeCorteISO("2026-09-12")).toBe("2026-09-15");
    expect(proximoDiaDeCorteISO("2026-09-15")).toBe("2026-10-01");
    expect(proximoDiaDeCorteISO("2026-12-20")).toBe("2027-01-01");
    expect(proximoDiaDeCorteISO("2026-09-01"), "el día de corte apunta al siguiente").toBe("2026-09-15");
  });

  it("los 365 días de 2027 apuntan a un día de corte posterior, a 17 días o menos", () => {
    let dias = 0;
    for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const hoy = new Date(t).toISOString().slice(0, 10);
      const proximo = proximoDiaDeCorteISO(hoy);
      expect(esDiaDeCorte(proximo), `${hoy} → ${proximo}`).toBe(true);
      expect(proximo > hoy, `${hoy} → ${proximo}`).toBe(true);
      expect(corteVencido(hoy, proximo), `${hoy} → ${proximo}: más lejos que lo que INV32 tolera`).toBe(false);
      dias++;
    }
    expect(dias).toBe(365);
  });

  it("el corte y el reporte con IA usan la fecha real y la ventana en hora de Costa Rica", () => {
    /* La edición que lo pone en rojo: volver a `addDaysISO(todayISO, 7)` o a la fecha UTC del corte. */
    for (const rel of ["lib/cobranza/digest.ts", "lib/cobranza/agents/reporte-finanzas.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, rel).toContain("proximoCorteISO: proximoDiaDeCorteISO(todayISO)");
      expect(src, rel).toContain("inicioDeVentanaISO(");
      expect(src, rel).not.toContain("addDaysISO(todayISO, 7)");
      expect(src, rel).not.toMatch(/capturedAt\.toISOString\(\)\.slice\(0, 10\)/);
    }
  });
});
