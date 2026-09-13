/**
 * lib/cobranza/ingresos-no-venta.test.ts
 *
 * El riesgo de la plata que no es venta no es la suma: es que vuelva a colarse en lo facturado. El
 * fondo de marketing de Insider (INV-26 + INV-27, US$5.346,91) entró al banco sin ser venta, y el
 * Compendio lo contaba como venta. Estos casos sostienen que, cargado en Ingresos variables, suma a
 * la caja y a nada más, y que mientras su categoría no tenga nombre queda a la vista.
 *
 * ÍNDICE
 *   A. el catálogo: una categoría desconocida vuelve a «sin clasificar»
 *   B. al reporte: mes de entrada, caja solo si ya entró, nada de otro año
 *   C. el caso real en el reporte: facturado, % de cobranza, brecha y margen no se mueven
 *   D. lo que falta clasificar, con la tasa de su mes
 *   E. el doble conteo con un cobro
 */
import { describe, expect, it } from "vitest";
import { calcularEquilibrio, periodosDelAnio, type EgresoDeMes, type IngresoDeMes } from "@/lib/finanzas/equilibrio";
import {
  CATEGORIAS_INGRESO_NO_VENTA,
  CATEGORIA_INGRESO_LABEL,
  SIN_CATEGORIA_LABEL,
  esCategoriaIngreso,
  etiquetaDeCategoria,
  ingresosNoVentaDelAnio,
  mensajeReferenciaYaEsCobro,
  normalizarReferenciaExterna,
  pendientesDeClasificar,
  type IngresoNoVentaFila,
} from "./ingresos-no-venta";

const HOY = "2026-09-13";

/** Los dos depósitos del fondo de Insider. El reparto entre las dos facturas es de prueba; el total es el real. */
const INV_27 = { fechaISO: "2026-06-30", monto: 2_673.46, moneda: "USD" as const };
const INV_26 = { fechaISO: "2026-07-07", monto: 2_673.45, moneda: "USD" as const };

// ── A ───────────────────────────────────────────────────────────────────────────

describe("A · el catálogo", () => {
  it("A1 cada categoría tiene su nombre en pantalla", () => {
    for (const c of CATEGORIAS_INGRESO_NO_VENTA) expect(CATEGORIA_INGRESO_LABEL[c].length).toBeGreaterThan(0);
  });

  it("A2 null es «sin clasificar», y una categoría que el código no conoce TAMBIÉN", () => {
    // Renombrar una categoría o escribirla a mano en la base no puede hacerla desaparecer de la
    // lista de pendientes con un nombre que nadie eligió.
    expect(etiquetaDeCategoria(null)).toBe(SIN_CATEGORIA_LABEL);
    expect(etiquetaDeCategoria("FONDO_DE_MARKETING_VIEJO")).toBe(SIN_CATEGORIA_LABEL);
    expect(esCategoriaIngreso("FONDO_DE_MARKETING_VIEJO")).toBe(false);
    expect(etiquetaDeCategoria("REEMBOLSO")).toBe("Reembolso o devolución");
  });

  it("A3 no hay un «Otro»: taparía justo la pregunta abierta", () => {
    expect(CATEGORIAS_INGRESO_NO_VENTA.some((c) => /OTRO/.test(c))).toBe(false);
  });
});

// ── B ───────────────────────────────────────────────────────────────────────────

describe("B · ingresosNoVentaDelAnio", () => {
  it("B1 cada depósito va al mes en que entró, como NO_VENTA y sin servicio", () => {
    const r = ingresosNoVentaDelAnio([INV_27, INV_26], 2026, HOY);
    expect(r).toEqual([
      { periodo: "2026-06", tipo: "NO_VENTA", monto: 2_673.46, moneda: "USD", tipoServicio: null, cobrada: true },
      { periodo: "2026-07", tipo: "NO_VENTA", monto: 2_673.45, moneda: "USD", tipoServicio: null, cobrada: true },
    ]);
  });

  it("B2 una fecha que todavía no llegó no es caja: la API la deja cargar, el reporte no la cobra", () => {
    const [r] = ingresosNoVentaDelAnio([{ fechaISO: "2026-10-01", monto: 100, moneda: "USD" }], 2026, HOY);
    expect(r!.cobrada).toBe(false);
    // Hoy mismo sí: la fecha es el día en que entró la plata.
    expect(ingresosNoVentaDelAnio([{ fechaISO: HOY, monto: 1, moneda: "USD" }], 2026, HOY)[0]!.cobrada).toBe(true);
  });

  it("B3 una fila de otro año no entra", () => {
    expect(ingresosNoVentaDelAnio([{ fechaISO: "2025-12-31", monto: 100, moneda: "USD" }], 2026, HOY)).toEqual([]);
  });
});

// ── C ───────────────────────────────────────────────────────────────────────────

describe("C · el fondo de Insider en el reporte de equilibrio", () => {
  const egresos: EgresoDeMes[] = periodosDelAnio(2026).map((periodo) => ({
    periodo,
    rubro: "FIJO_OPERACION",
    concepto: "Alquiler",
    conceptoClave: "alquiler",
    monto: 3_000,
    moneda: "USD",
    calidad: "MEDIDO",
  }));
  const ventas: IngresoDeMes[] = [
    { periodo: "2026-06", tipo: "COBRADO", monto: 2_000, moneda: "USD", tipoServicio: "SUSCRIPCION" },
    { periodo: "2026-07", tipo: "POR_COBRAR", monto: 1_000, moneda: "USD", tipoServicio: "SUSCRIPCION", enPlazo: false },
  ];
  const sin = () => calcularEquilibrio(egresos, ventas, { anio: 2026, hoyISO: HOY });
  const con = () =>
    calcularEquilibrio(egresos, [...ventas, ...ingresosNoVentaDelAnio([INV_27, INV_26], 2026, HOY)], {
      anio: 2026,
      hoyISO: HOY,
    });

  it("C1 lo facturado, los ingresos, la brecha y el margen a la fecha no se mueven un centavo", () => {
    const a = sin();
    const b = con();
    expect(b.indicadores.facturadoTotal).toBe(a.indicadores.facturadoTotal);
    expect(b.indicadores.ingresosTotales).toBe(a.indicadores.ingresosTotales);
    expect(b.indicadores.margenAlDia).toBe(a.indicadores.margenAlDia);
    expect(b.meses.map((m) => m.brecha)).toEqual(a.meses.map((m) => m.brecha));
    expect(b.meses.map((m) => m.cubreEgresos)).toEqual(a.meses.map((m) => m.cubreEgresos));
  });

  it("C2 el % de cobranza tampoco, ni en dólares ni por moneda: no es plata que se le facturó a nadie", () => {
    expect(con().indicadores.cobranza).toEqual(sin().indicadores.cobranza);
    expect(con().cobranzaPorMoneda).toEqual(sin().cobranzaPorMoneda);
  });

  it("C3 lo que entró está en la caja: los US$5.346,91, repartidos en junio y julio", () => {
    const r = con();
    expect(r.indicadores.noVentaTotal).toBe(5_346.91);
    expect(r.indicadores.noVentaCobradoTotal).toBe(5_346.91);
    expect(r.meses[5]!.noVenta).toBe(2_673.46);
    expect(r.meses[6]!.noVentaCobrado).toBe(2_673.45);
  });

  it("C4 no entra al desglose por servicio ni al punto de equilibrio", () => {
    expect(con().ingresosPorServicio).toEqual(sin().ingresosPorServicio);
    expect(con().equilibrio.base).toBe(sin().equilibrio.base);
  });

  it("C5 el reporte lo declara: un aviso con los meses en que entró", () => {
    const aviso = con().calidad.avisos.find((a) => a.codigo === "INGRESOS_NO_VENTA");
    expect(aviso?.periodos).toEqual(["2026-06", "2026-07"]);
    expect(aviso?.mensaje).toMatch(/USD 5\D346,91 entraron sin ser venta/);
    expect(sin().calidad.avisos.some((a) => a.codigo === "INGRESOS_NO_VENTA")).toBe(false);
  });
});

// ── D ───────────────────────────────────────────────────────────────────────────

describe("D · pendientesDeClasificar", () => {
  const fila = (extra: Partial<IngresoNoVentaFila>): IngresoNoVentaFila => ({
    ...INV_26,
    concepto: "Fondo de marketing de Insider",
    categoria: null,
    referenciaExterna: "INV-26",
    clienteNombre: null,
    ...extra,
  });
  const ENLACES = [{ etiqueta: "Ingresos variables", url: "/finanzas/ingresos-variables" }];
  /** Dólares tal cual; colones solo con la tasa de agosto (455). */
  const aUsd = (monto: number, moneda: "CRC" | "USD", periodo: string) =>
    moneda === "USD" ? monto : periodo === "2026-08" ? Math.round((monto / 455) * 100) / 100 : null;

  it("D1 el fondo sin categoría sale con su monto, su fecha, su referencia y a dónde ir", () => {
    const r = pendientesDeClasificar([fila({})], aUsd, ENLACES);
    expect(r.cuantas).toBe(1);
    expect(r.monto).toBe(2_673.45);
    expect(r.items[0]).toEqual({
      texto: "Fondo de marketing de Insider",
      monto: 2_673.45,
      nota: "entró el 2026-07-07 · ref. INV-26 · sin cliente",
      enlaces: ENLACES,
    });
  });

  it("D2 lo clasificado no aparece; una categoría desconocida sí", () => {
    const r = pendientesDeClasificar(
      [fila({ categoria: "REEMBOLSO" }), fila({ categoria: "ALGO_QUE_YA_NO_EXISTE", concepto: "Viejo" })],
      aUsd,
      ENLACES,
    );
    expect(r.items.map((i) => i.texto)).toEqual(["Viejo"]);
  });

  it("D3 colones con la tasa de su mes suman; sin tasa no suman y la nota lleva la moneda", () => {
    const r = pendientesDeClasificar(
      [
        fila({ concepto: "Agosto", fechaISO: "2026-08-10", monto: 455_000, moneda: "CRC", referenciaExterna: null }),
        fila({ concepto: "Octubre", fechaISO: "2026-10-10", monto: 50_000, moneda: "CRC", referenciaExterna: null }),
      ],
      aUsd,
      ENLACES,
    );
    expect(r.monto).toBe(1_000);
    expect(r.items.map((i) => [i.texto, i.monto])).toEqual([
      ["Agosto", 1_000],
      ["Octubre", undefined],
    ]);
    // El separador de miles de «es-CR» depende del ICU de Node (punto o espacio fino): se mira el resto.
    expect(r.items[1]!.nota).toMatch(/CRC 50\D000,00 sin tipo de cambio: no suma/);
  });
});

// ── E ───────────────────────────────────────────────────────────────────────────

describe("E · el doble conteo con un cobro", () => {
  it("E1 la referencia se escribe igual que el número de factura de un cobro: «inv - 26» choca con «INV-26»", () => {
    expect(normalizarReferenciaExterna(" inv - 26 ")).toBe("INV-26");
    expect(normalizarReferenciaExterna("   ")).toBeNull();
  });

  it("E2 el 409 nombra el documento y la cuenta, y dice qué corregir", () => {
    const m = mensajeReferenciaYaEsCobro("INV-26", "Insider");
    expect(m).toContain("«INV-26» ya es la factura de un cobro de Insider");
    expect(m).toContain("ya cuenta como venta");
  });
});
