/**
 * lib/finanzas/metas-de-gerencia.test.ts — cómo mide Nexus el avance de las metas de gerencia (2026-11-13).
 * Los números de los ejemplos son los de producción del 13 nov: el MRR gestionado (126.119,87), el plan de partner de
 * septiembre a diciembre y los servicios recurrentes de Cobranza.
 */
import { describe, expect, it } from "vitest";
import {
  DEFINICION_DE_MEDIDA,
  MEDIDAS,
  comisionMensualDeHubspot,
  estadoDeLaMeta,
  leerAvanceManual,
  leerMontoEscrito,
  leerMrrGestionado,
  leerMrrVendidoNuevo,
  leerPlanDePartner,
  leerServiciosRecurrentes,
  leerVentasGanadas,
  medidaDe,
  type CuentaDePartner,
  type TramoDelPlanDePartner,
} from "./metas-de-gerencia";
import { metaDeGerenciaSchema } from "./metas-de-gerencia-esquema";

const cuenta = (c: Partial<CuentaDePartner>): CuentaDePartner => ({
  gestionada: true,
  mrrGestionado: null,
  mrrVendido: null,
  ventaDesde: null,
  comisionMensual: null,
  ...c,
});

describe("cada medida tiene su explicación", () => {
  it("las seis dicen qué miden y de dónde sale el número", () => {
    for (const m of MEDIDAS) {
      expect(DEFINICION_DE_MEDIDA[m].queMide.length, m).toBeGreaterThan(20);
      expect(DEFINICION_DE_MEDIDA[m].deDondeSale.length, m).toBeGreaterThan(10);
    }
  });

  it("una clave que el código no conoce se lee como «a mano», no rompe", () => {
    expect(medidaDe("mrr_gestionado_partner")).toBe("mrr_gestionado_partner");
    expect(medidaDe("algo_nuevo")).toBe("manual");
  });
});

describe("MRR gestionado (el nivel Elite)", () => {
  it("suma la parte de Smarteam de las cuentas gestionadas y deja afuera las no gestionadas", () => {
    const l = leerMrrGestionado(
      [
        cuenta({ mrrGestionado: 1080.15 }),
        cuenta({ mrrGestionado: 1809 }),
        cuenta({ gestionada: false, mrrGestionado: 500 }),
        cuenta({ mrrGestionado: 0 }),
      ],
      "2026-11-12",
    );
    expect(l.valor).toBe(2889.15);
    expect(l.al).toBe("2026-11-12");
    expect(l.detalle[0]).toBe("2 cuentas gestionadas.");
  });

  it("sin copia de Partner no inventa un cero", () => {
    const l = leerMrrGestionado([], null);
    expect(l.valor).toBeNull();
    expect(l.aviso).toMatch(/copia de HubSpot Partner/);
  });

  it("la comisión de HubSpot de hoy es la suma de la de cada cuenta", () => {
    expect(comisionMensualDeHubspot([cuenta({ comisionMensual: 4701.6 }), cuenta({ comisionMensual: 0.4 }), cuenta({})])).toBe(4702);
  });
});

describe("MRR vendido de cuentas nuevas", () => {
  it("cuenta solo las ventas que empezaron dentro del período, con los dos bordes", () => {
    const cuentas = [
      cuenta({ mrrVendido: 100, ventaDesde: "2026-08-31" }),
      cuenta({ mrrVendido: 200, ventaDesde: "2026-09-01" }),
      cuenta({ mrrVendido: 300, ventaDesde: "2026-12-31" }),
      cuenta({ mrrVendido: 400, ventaDesde: "2027-01-01" }),
      cuenta({ mrrVendido: 50, ventaDesde: null }),
    ];
    const l = leerMrrVendidoNuevo(cuentas, "2026-11-12", "2026-09-01", "2026-12-31");
    expect(l.valor).toBe(500);
    expect(l.detalle[0]).toBe("2 cuentas nuevas en el período.");
  });
});

describe("el plan de partner de HubSpot (el bono del 15 %)", () => {
  // Producción, 13 nov: septiembre a diciembre.
  const tramos: TramoDelPlanDePartner[] = [
    { tipo: "assisted_deal_mrr", mes: "2026-08", monto: 3753.1, avance: 2185.5 },
    { tipo: "assisted_deal_mrr", mes: "2026-09", monto: 2484.3, avance: 1301.5 },
    { tipo: "assisted_deal_mrr", mes: "2026-10", monto: 1170, avance: 0 },
    { tipo: "assisted_deal_mrr", mes: "2026-11", monto: 2925, avance: 340 },
    { tipo: "assisted_deal_mrr", mes: "2026-12", monto: 3812.61, avance: 0 },
    { tipo: "sourced_deal_mrr", mes: "2026-09", monto: 21819.2, avance: 4804.52 },
    { tipo: "sourced_deal_mrr", mes: "2026-10", monto: 1234.95, avance: 924 },
    { tipo: "sourced_deal_mrr", mes: "2026-11", monto: 0, avance: 600.86 },
    { tipo: "sourced_deal_mrr", mes: "2026-12", monto: 646.1, avance: null },
  ];

  it("suma el avance de HubSpot de los meses del período, traídos y asistidos", () => {
    const l = leerPlanDePartner(tramos, "2026-11-13", "2026-09-01", "2026-12-31");
    expect(l.valor).toBe(7970.88);
    expect(l.detalle[0]).toContain("traídos por Smarteam");
    expect(l.detalle[0]).toContain("asistidos");
    // La meta propia de HubSpot para esos meses va al lado, como referencia.
    expect(l.detalle[1]).toContain("4 meses");
  });

  it("sin tramos para esos meses lo dice, no da cero", () => {
    const l = leerPlanDePartner(tramos, "2026-11-13", "2027-01-01", "2027-03-31");
    expect(l.valor).toBeNull();
    expect(l.aviso).toMatch(/no tiene metas del plan de partner/);
  });
});

describe("MRR de servicios recurrentes (el bono de US$12.000)", () => {
  it("suma los cobros del mes en dólares; un servicio sin cobro ese mes y lo que está en colones van aparte", () => {
    // Noviembre de 2026 en producción: seis cobros por US$1.114, y el soporte de 320 sin cobro.
    const l = leerServiciosRecurrentes(
      [
        { cobrosDelMes: [{ monto: 60, moneda: "USD" }] },
        { cobrosDelMes: [{ monto: 65, moneda: "USD" }] },
        { cobrosDelMes: [{ monto: 150, moneda: "USD" }] },
        { cobrosDelMes: [{ monto: 250, moneda: "USD" }] },
        { cobrosDelMes: [{ monto: 289, moneda: "USD" }] },
        // La continuidad web de 3.600 en 12 cuotas: cuenta la cuota, no el contrato.
        { cobrosDelMes: [{ monto: 300, moneda: "USD" }] },
        { cobrosDelMes: [] },
        { cobrosDelMes: [{ monto: 50000, moneda: "CRC" }] },
      ],
      "2026-11-13",
    );
    expect(l.valor).toBe(1114);
    expect(l.al).toBe("2026-11-13");
    expect(l.detalle).toEqual([
      "7 servicios recurrentes activos cobran en noviembre.",
      "Sin cobro en noviembre, y por eso afuera: 1 servicio recurrente activo.",
      "₡50.000 en colones, sin convertir: no está sumado.",
    ]);
  });

  it("sin servicios es cero, no un hueco", () => {
    expect(leerServiciosRecurrentes([], "2026-11-13").valor).toBe(0);
  });
});

describe("ventas ganadas", () => {
  it("suma en dólares dentro del período y cuenta aparte lo que no se puede sumar", () => {
    const l = leerVentasGanadas(
      [
        { cierre: "2026-09-01", monto: 1000, moneda: "USD" },
        { cierre: "2026-12-31", monto: 500, moneda: "USD" },
        { cierre: "2027-01-01", monto: 9999, moneda: "USD" },
        { cierre: "2026-10-01", monto: 300000, moneda: "CRC" },
        { cierre: "2026-10-02", monto: null, moneda: "USD" },
      ],
      "2026-11-13",
      "2026-09-01",
      "2026-12-31",
    );
    expect(l.valor).toBe(1500);
    expect(l.detalle).toEqual(["2 negocios ganados en dólares.", "1 negocio en otra moneda: no están sumados.", "1 negocio no tiene monto en HubSpot."]);
  });
});

describe("el avance escrito a mano", () => {
  it("vale con su fecha; sin avance no hay número", () => {
    expect(leerAvanceManual(7000, "2026-11-10")).toEqual({ valor: 7000, al: "2026-11-10", detalle: [], aviso: null });
    expect(leerAvanceManual(null, null).valor).toBeNull();
    expect(leerAvanceManual(5, null).aviso).toMatch(/a qué día/);
  });
});

describe("cómo va la meta", () => {
  it("el bono de recurrentes: 1.114 de 12.000 es el 9 % y faltan 10.886", () => {
    const e = estadoDeLaMeta({ objetivoUsd: 12000, forma: "nivel", desde: null, hasta: null, corteEn: null }, 1114, "2026-11-13");
    expect(Math.round(e.pct! * 100)).toBe(9);
    expect(e.falta).toBe(10886);
    expect(e.cumplida).toBe(false);
    expect(e.tiempoPct).toBeNull();
    expect(e.diasAlCorte).toBeNull();
  });

  it("acumulada: cuánto del período pasó y cuántos días faltan al corte", () => {
    const e = estadoDeLaMeta({ objetivoUsd: 32588, forma: "acumulado", desde: "2026-09-01", hasta: "2026-12-31", corteEn: "2026-12-31" }, 7970.88, "2026-11-13");
    expect(e.diasAlCorte).toBe(48);
    // 74 días de 122.
    expect(e.tiempoPct).toBeCloseTo(74 / 122, 5);
    expect(e.falta).toBe(24617.12);
  });

  it("pasarse del objetivo es cumplida y no falta nada", () => {
    const e = estadoDeLaMeta({ objetivoUsd: 100, forma: "nivel", desde: null, hasta: null, corteEn: "2026-11-01" }, 150, "2026-11-13");
    expect(e.cumplida).toBe(true);
    expect(e.falta).toBe(0);
    expect(e.diasAlCorte).toBe(-12);
  });

  it("sin objetivo (el requisito de Elite que falta cargar) no hay porcentaje ni falta", () => {
    const e = estadoDeLaMeta({ objetivoUsd: null, forma: "nivel", desde: null, hasta: null, corteEn: null }, 126119.87, "2026-11-13");
    expect(e.pct).toBeNull();
    expect(e.falta).toBeNull();
    expect(e.cumplida).toBe(false);
  });

  it("antes de empezar el período el tiempo es cero, y después nunca pasa del 100 %", () => {
    const m = { objetivoUsd: 10, forma: "acumulado" as const, desde: "2026-09-01", hasta: "2026-09-30", corteEn: null };
    expect(estadoDeLaMeta(m, 0, "2026-08-01").tiempoPct).toBe(0);
    expect(estadoDeLaMeta(m, 0, "2027-01-01").tiempoPct).toBe(1);
  });
});

describe("el monto escrito a mano", () => {
  it.each([
    ["32.588", 32588],
    ["32,588", 32588],
    ["32588", 32588],
    ["US$ 12.000", 12000],
    ["126.119,87", 126119.87],
    ["126119.87", 126119.87],
    ["1.5", 1.5],
  ])("«%s» es %d", (texto, n) => {
    expect(leerMontoEscrito(texto)).toBe(n);
  });

  it("vacío o texto no es un monto", () => {
    expect(leerMontoEscrito("  ")).toBeNull();
    expect(leerMontoEscrito("doce mil")).toBeNull();
  });
});

describe("lo que se escribe", () => {
  const base = {
    nombre: "Bono del 15 %",
    medida: "mrr_negocios_partner" as const,
    objetivoUsd: 32588,
    desde: "2026-09-01",
    hasta: "2026-12-31",
    corteEn: "2026-12-31",
    premio: "  ",
    paraQuien: null,
    avanceManualUsd: null,
    avanceManualAl: null,
    nota: null,
  };

  it("una meta completa pasa, y un texto vacío se guarda como nada", () => {
    const r = metaDeGerenciaSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.premio).toBeNull();
  });

  it("una medida que suma dentro de un período pide el período", () => {
    const r = metaDeGerenciaSchema.safeParse({ ...base, desde: null });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toMatch(/período/);
  });

  it("una medida de nivel no pide período, y el objetivo puede faltar", () => {
    expect(metaDeGerenciaSchema.safeParse({ ...base, medida: "mrr_gestionado_partner", desde: null, hasta: null, objetivoUsd: null }).success).toBe(true);
  });

  it("el período no puede terminar antes de empezar", () => {
    expect(metaDeGerenciaSchema.safeParse({ ...base, desde: "2026-12-31", hasta: "2026-09-01" }).success).toBe(false);
  });

  it("a mano pide el avance y su día", () => {
    expect(metaDeGerenciaSchema.safeParse({ ...base, medida: "manual", desde: null, hasta: null }).success).toBe(false);
    expect(metaDeGerenciaSchema.safeParse({ ...base, medida: "manual", avanceManualUsd: 7000, avanceManualAl: "2026-11-13" }).success).toBe(true);
  });

  it("una medida que no existe no entra", () => {
    expect(metaDeGerenciaSchema.safeParse({ ...base, medida: "inventada" }).success).toBe(false);
  });
});
