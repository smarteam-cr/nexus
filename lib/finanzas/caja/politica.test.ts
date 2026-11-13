import { describe, expect, it } from "vitest";
import { compromisoSchema } from "./esquemas";
import {
  CATEGORIAS_DE_PAGO,
  COMISIONISTAS_EL_DIA_7,
  cuotasDePago,
  dia7DeLaFactura,
  escenarioDe,
  lunesDeLaSemana,
  siguienteDia7,
  viernesDelCorte,
  type CompromisoParaFechar,
} from "./politica";

const base = (c: Partial<CompromisoParaFechar>): CompromisoParaFechar => ({
  id: "c1",
  concepto: "Desarrollo",
  beneficiario: "Proveedor",
  categoria: "SERVICIOS_PROFESIONALES",
  monto: 1000,
  moneda: "USD",
  fechaISO: null,
  facturaRecibidaISO: null,
  entregadoISO: null,
  adelantoPct: 0,
  adelantoPagadoISO: null,
  cobro: null,
  ...c,
});

describe("las fechas de la política", () => {
  it("escenario A: del 1 al 3 se paga el 7; del 4 en adelante, el 7 del mes siguiente (y diciembre salta de año)", () => {
    expect(dia7DeLaFactura("2026-11-01")).toBe("2026-11-07");
    expect(dia7DeLaFactura("2026-11-03")).toBe("2026-11-07");
    expect(dia7DeLaFactura("2026-11-04")).toBe("2026-12-07");
    expect(dia7DeLaFactura("2026-12-20")).toBe("2027-01-07");
  });

  it("el primer 7 desde un día, contando ese día", () => {
    expect(siguienteDia7("2026-11-07")).toBe("2026-11-07");
    expect(siguienteDia7("2026-11-08")).toBe("2026-12-07");
  });

  it("escenario B: lunes a miércoles van al viernes de esa semana; jueves a domingo, al siguiente", () => {
    // 2026-11-09 es lunes.
    expect(viernesDelCorte("2026-11-09")).toBe("2026-11-13");
    expect(viernesDelCorte("2026-11-11")).toBe("2026-11-13"); // miércoles: el corte
    expect(viernesDelCorte("2026-11-12")).toBe("2026-11-20"); // jueves
    expect(viernesDelCorte("2026-11-13")).toBe("2026-11-20"); // viernes
    expect(viernesDelCorte("2026-11-15")).toBe("2026-11-20"); // domingo
  });

  it("la semana va de lunes a domingo", () => {
    expect(lunesDeLaSemana("2026-11-13")).toBe("2026-11-09");
    expect(lunesDeLaSemana("2026-11-15")).toBe("2026-11-09");
    expect(lunesDeLaSemana("2026-11-16")).toBe("2026-11-16");
  });

  it("los comisionistas siguen con «mes vencido» hasta que se confirme el día 7", () => {
    expect(COMISIONISTAS_EL_DIA_7).toBe(false);
    expect(escenarioDe("COMISIONISTA")).toBe("MES_VENCIDO");
    expect(escenarioDe("COMISIONISTA", { comisionistasElDia7: true })).toBe("A");
    expect(escenarioDe("ARTICULO_FISICO")).toBe("B");
    expect(escenarioDe("IMPUESTOS_Y_CARGAS")).toBe("FECHA_FIJA");
  });
});

describe("cuotasDePago", () => {
  const hoy = "2026-11-13";

  it("la fecha anotada a mano manda sobre la política", () => {
    const [c] = cuotasDePago(base({ fechaISO: "2026-11-20", facturaRecibidaISO: "2026-11-02" }), hoy);
    expect(c.fechaISO).toBe("2026-11-20");
    expect(c.estado).toBe("PROGRAMADO");
  });

  it("A sin factura: no tiene fecha, se estima el 7 que le tocaría y nunca antes de hoy", () => {
    const [c] = cuotasDePago(base({}), hoy);
    expect(c.fechaISO).toBeNull();
    expect(c.estado).toBe("FALTA_LA_FACTURA");
    expect(c.fechaEstimadaISO).toBe("2026-12-07");
  });

  it("A con factura del 2 y el cliente sin pagar: espera al cliente, se estima el 7 después del cobro", () => {
    const [c] = cuotasDePago(
      base({
        facturaRecibidaISO: "2026-11-02",
        cobro: { estado: "POR_COBRAR", fechaProgramadaISO: "2026-11-20", fechaCobroISO: null, clienteNombre: "Wherex" },
      }),
      hoy,
    );
    expect(c.estado).toBe("ESPERA_AL_CLIENTE");
    expect(c.fechaISO).toBeNull();
    expect(c.fechaEstimadaISO).toBe("2026-12-07");
  });

  it("A con el cliente ya pagado después del 7: se paga el 7 siguiente al cobro", () => {
    const [c] = cuotasDePago(
      base({
        facturaRecibidaISO: "2026-11-02",
        cobro: { estado: "COBRADO", fechaProgramadaISO: "2026-11-05", fechaCobroISO: "2026-11-10", clienteNombre: "Wherex" },
      }),
      hoy,
    );
    expect(c.fechaISO).toBe("2026-12-07");
  });

  it("A con factura del 2 y sin cobro atado: el 7, y como ya pasó queda atrasado", () => {
    const [c] = cuotasDePago(base({ facturaRecibidaISO: "2026-11-02" }), hoy);
    expect(c.fechaISO).toBe("2026-11-07");
    expect(c.atrasado).toBe(true);
    expect(c.fechaEstimadaISO).toBe(hoy);
  });

  it("B con 50 % de adelanto: el adelanto el viernes del pedido y el resto espera la entrega", () => {
    const cuotas = cuotasDePago(base({ categoria: "ARTICULO_FISICO", facturaRecibidaISO: "2026-11-11", adelantoPct: 50 }), hoy);
    expect(cuotas.map((c) => [c.parte, c.monto, c.fechaISO, c.estado])).toEqual([
      ["ADELANTO", 500, "2026-11-13", "PROGRAMADO"],
      ["RESTO", 500, null, "ESPERA_LA_ENTREGA"],
    ]);
  });

  it("B: el adelanto ya pagado no vuelve a salir, y el resto va al viernes del corte de la entrega", () => {
    const cuotas = cuotasDePago(
      base({ categoria: "ARTICULO_FISICO", facturaRecibidaISO: "2026-11-02", adelantoPct: 30, adelantoPagadoISO: "2026-11-06", entregadoISO: "2026-11-12" }),
      hoy,
    );
    expect(cuotas).toHaveLength(1);
    expect(cuotas[0]).toMatchObject({ parte: "RESTO", monto: 700, fechaISO: "2026-11-20" });
  });

  it("B: un adelanto de más del 50 % se recorta al 50", () => {
    const cuotas = cuotasDePago(base({ categoria: "ARTICULO_FISICO", facturaRecibidaISO: "2026-11-11", adelantoPct: 80 }), hoy);
    expect(cuotas[0].monto).toBe(500);
  });

  it("comisionista con el cliente pagado: mes vencido, el siguiente fin de mes", () => {
    const [c] = cuotasDePago(
      base({
        categoria: "COMISIONISTA",
        cobro: { estado: "COBRADO", fechaProgramadaISO: "2026-11-05", fechaCobroISO: "2026-11-10", clienteNombre: "Wherex" },
      }),
      hoy,
    );
    expect(c.fechaISO).toBe("2026-11-30");
    expect(c.escenario).toBe("MES_VENCIDO");
  });

  it("comisionista con el día 7 prendido: pasa al escenario A", () => {
    const [c] = cuotasDePago(base({ categoria: "COMISIONISTA", facturaRecibidaISO: "2026-12-02" }), hoy, { comisionistasElDia7: true });
    expect(c.fechaISO).toBe("2026-12-07");
  });

  it("impuestos sin fecha: se cuentan hoy y se pide la fecha", () => {
    const [c] = cuotasDePago(base({ categoria: "IMPUESTOS_Y_CARGAS" }), hoy);
    expect(c.estado).toBe("SIN_FECHA");
    expect(c.fechaEstimadaISO).toBe(hoy);
  });
});

describe("la planilla no se anota como pago comprometido (revisión del 2026-11-13)", () => {
  it("no hay categoría «Planilla»: la caja ya la resta con sus cargas, y anotarla la contaba dos veces", () => {
    expect(CATEGORIAS_DE_PAGO as readonly string[]).not.toContain("PLANILLA");
    const r = compromisoSchema.safeParse({ tipo: "PAGO", concepto: "Planilla de noviembre", categoria: "PLANILLA", monto: 1000, moneda: "CRC" });
    expect(r.success).toBe(false);
  });
});
