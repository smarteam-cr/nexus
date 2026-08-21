/**
 * lib/cobranza/equilibrio-escenario.test.ts
 *
 * El riesgo de este módulo no es la aritmética: es que el ENCABEZADO y la TABLA de la
 * misma pantalla cuenten historias distintas. Por eso el caso que más importa es el
 * que compara los indicadores recalculados en el navegador contra los que armó el
 * servidor: sin escenario tienen que dar exactamente lo mismo, al centavo.
 */
import { describe, expect, it } from "vitest";
import { calcularEquilibrio, type EgresoDeMes, type IngresoDeMes } from "@/lib/finanzas/equilibrio";
import {
  aplicarEscenario,
  igualarAlEquilibrio,
  indicadoresDe,
  limpiarFacturado,
  parseMonto,
} from "./equilibrio-escenario";

const HOY = "2026-08-17";

const eg = (periodo: string, monto: number): EgresoDeMes => ({
  periodo,
  rubro: "PLANILLA",
  concepto: "Planilla",
  conceptoClave: "planilla",
  monto,
  moneda: "USD",
  calidad: "MEDIDO",
});

const ing = (periodo: string, tipo: IngresoDeMes["tipo"], monto: number): IngresoDeMes => ({
  periodo,
  tipo,
  monto,
  moneda: "USD",
  tipoServicio: "IMPLEMENTACION",
});

/** Un reporte chico pero completo: tres meses con datos, el resto vacío. */
function reporteBase() {
  return calcularEquilibrio(
    [eg("2026-01", 24_409.63), eg("2026-02", 24_409.63), eg("2026-03", 27_266.63)],
    [
      ing("2026-01", "COBRADO", 31_595),
      ing("2026-01", "POR_COBRAR", 23_501),
      ing("2026-02", "COBRADO", 32_372),
      ing("2026-03", "COBRADO", 29_238.66),
      { periodo: "2026-02", tipo: "COMISION_PARTNER", monto: 41_553.36, moneda: "USD", tipoServicio: null, cobrada: true },
    ],
    { anio: 2026, hoyISO: HOY },
  );
}

describe("aplicarEscenario", () => {
  it("sin overrides, cada mes queda idéntico al real y ninguno se marca simulado", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, {});
    expect(efectivos.every((m) => !m.simulado)).toBe(true);
    expect(efectivos[0]!.facturadoEfectivo).toBe(r.meses[0]!.facturado);
    expect(efectivos[0]!.brecha).toBe(r.meses[0]!.brecha);
  });

  it("EL CASO QUE IMPORTA: sin escenario, el navegador reproduce al servidor al centavo", () => {
    const r = reporteBase();
    const ind = indicadoresDe(aplicarEscenario(r.meses, {}));
    expect(ind.facturadoTotal).toBe(r.indicadores.facturadoTotal);
    expect(ind.ingresosTotales).toBe(r.indicadores.ingresosTotales);
    expect(ind.margenAnual).toBe(r.indicadores.margenAnual);
    expect(ind.mesesQueCubren).toBe(r.indicadores.mesesQueCubren);
    expect(ind.tasaCobro).toBe(r.indicadores.tasaCobro);
    expect(ind.vendidoTotal).toBe(r.indicadores.vendidoTotal);
  });

  it("simular NO toca lo vendido: mover el facturado es otra pregunta", () => {
    // El card de «Vendido del año» tiene que decir lo mismo con y sin escenario. Mover el
    // facturado de enero es preguntarse qué pasaría si se facturara más, no reescribir
    // lo que se vendió — que ya ocurrió.
    const r = reporteBase();
    const sin = indicadoresDe(aplicarEscenario(r.meses, {}));
    const con = indicadoresDe(aplicarEscenario(r.meses, { "2026-01": 999_999 }));
    expect(con.vendidoTotal).toBe(sin.vendidoTotal);
  });

  it("mover un mes recalcula SU brecha y no toca la de los demás", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, { "2026-03": 40_000 });
    expect(efectivos[2]!.simulado).toBe(true);
    expect(efectivos[2]!.brecha).toBe(round(40_000 - 27_266.63));
    expect(efectivos[0]!.simulado).toBe(false);
    expect(efectivos[0]!.brecha).toBe(r.meses[0]!.brecha);
  });

  it("simular NO mueve los egresos ni el partnership: eso no depende de lo que se venda", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, { "2026-02": 0 });
    expect(efectivos[1]!.egresos).toBe(24_409.63);
    expect(efectivos[1]!.partnership).toBe(41_553.36);
    expect(efectivos[1]!.ingresosTotales).toBe(41_553.36); // solo el aliado
  });

  it("un mes PARCIAL sigue sin afirmar que cubre, por más que se le suba el facturado", () => {
    const r = reporteBase();
    const abril = aplicarEscenario(r.meses, { "2026-04": 999_999 })[3]!;
    expect(abril.estado).toBe("PARCIAL");
    expect(abril.cubreEgresos).toBeNull();
  });

  it("un override en cero es una simulación, no «volver al real»", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, { "2026-01": 0 });
    expect(efectivos[0]!.simulado).toBe(true);
    expect(efectivos[0]!.facturadoEfectivo).toBe(0);
  });
});

describe("indicadoresDe", () => {
  it("la tasa de cobro se mide contra el facturado REAL, no contra el simulado", () => {
    // Si se midiera contra el simulado, subir el facturado a mano bajaría el % de
    // cobro sin que nadie haya dejado de pagar — y ese número se cita suelto.
    const r = reporteBase();
    const conEscenario = indicadoresDe(aplicarEscenario(r.meses, { "2026-01": 200_000 }));
    expect(conEscenario.tasaCobro).toBe(r.indicadores.tasaCobro);
    expect(conEscenario.facturadoTotal).not.toBe(r.indicadores.facturadoTotal);
  });

  it("cuenta cuántos meses están simulados, para poder avisarlo en pantalla", () => {
    const r = reporteBase();
    expect(indicadoresDe(aplicarEscenario(r.meses, {})).mesesSimulados).toBe(0);
    expect(indicadoresDe(aplicarEscenario(r.meses, { "2026-01": 1, "2026-02": 2 })).mesesSimulados).toBe(2);
  });
});

describe("igualarAlEquilibrio y limpiarFacturado", () => {
  it("igualar deja cada mes sobre el piso, nunca por debajo", () => {
    const r = reporteBase();
    const piso = 26_968.71;
    const efectivos = aplicarEscenario(r.meses, igualarAlEquilibrio(r.meses, piso));
    for (const m of efectivos) expect(m.ingresosTotales).toBeGreaterThanOrEqual(piso);
  });

  it("EL QUE MOTIVA EL CAMBIO: igualar NUNCA baja un mes que ya facturó de más", () => {
    // La primera versión le ponía a todos exactamente el piso, y con eso el escenario
    // mostraba un año PEOR que el real debajo de un botón que se lee como aspiración.
    // Nadie se pregunta "¿y si hubiera facturado menos?".
    const r = reporteBase();
    const ov = igualarAlEquilibrio(r.meses, 26_968.71);
    for (const m of r.meses) expect(ov[m.periodo]!).toBeGreaterThanOrEqual(m.facturado);
  });

  it("el año simulado nunca factura menos que el real", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, igualarAlEquilibrio(r.meses, 26_968.71));
    const real = r.meses.reduce((n, m) => n + m.facturado, 0);
    const simulado = efectivos.reduce((n, m) => n + m.facturadoEfectivo, 0);
    expect(simulado).toBeGreaterThanOrEqual(real);
  });

  it("un mes cuyo ALIADO ya supera el piso no necesita facturar nada NUEVO", () => {
    // Febrero trae $41.553 de comisión contra un piso de $26.968: no hace falta vender
    // un peso más. Pero lo que YA facturó tampoco se borra — se queda como está.
    const r = reporteBase();
    const feb = aplicarEscenario(r.meses, igualarAlEquilibrio(r.meses, 26_968.71))[1]!;
    expect(feb.facturadoEfectivo).toBe(r.meses[1]!.facturado);
    expect(feb.ingresosTotales).toBeGreaterThanOrEqual(41_553.36);
  });

  it("igualar descuenta el partnership: no hay que vender lo que el aliado ya trajo", () => {
    // Enero no tiene comisión, así que le toca el piso entero (o lo que ya facturó, si
    // fuera más). Lo que se prueba es que el aliado DESCUENTA, no que se ignora.
    const r = reporteBase();
    const ov = igualarAlEquilibrio(r.meses, 26_968.71);
    expect(ov["2026-01"]).toBe(Math.max(26_968.71, r.meses[0]!.facturado));
    expect(ov["2026-02"]).toBeLessThan(ov["2026-01"]! + 41_553.36);
  });

  it("limpiar deja los doce meses en cero y TODOS marcados como simulados", () => {
    const r = reporteBase();
    const efectivos = aplicarEscenario(r.meses, limpiarFacturado(r.meses));
    expect(efectivos.every((m) => m.simulado)).toBe(true);
    expect(efectivos.every((m) => m.facturadoEfectivo === 0)).toBe(true);
    // Y es distinto de resetear: ahí no quedaría ninguno simulado.
    expect(aplicarEscenario(r.meses, {}).some((m) => m.simulado)).toBe(false);
  });
});

describe("parseMonto — lo que teclea una persona", () => {
  it("acepta el formato que se copia de una hoja en español", () => {
    expect(parseMonto("31595")).toBe(31_595);
    expect(parseMonto("$31.595")).toBe(31_595);
    expect(parseMonto("31595,50")).toBe(31_595.5);
    expect(parseMonto(" 1.234,56 ")).toBe(1234.56);
  });

  it("vacío devuelve null: el llamador vuelve al dato real, no escribe un cero", () => {
    expect(parseMonto("")).toBeNull();
    expect(parseMonto("   ")).toBeNull();
  });

  it("basura y negativos devuelven null en vez de propagar NaN a todos los totales", () => {
    expect(parseMonto("abc")).toBeNull();
    expect(parseMonto("-500")).toBeNull();
    expect(parseMonto("1e999")).toBeNull();
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
