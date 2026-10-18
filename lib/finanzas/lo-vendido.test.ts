/**
 * lib/finanzas/lo-vendido.test.ts — lo vendido según las propuestas ganadas (2026-10-18).
 *
 * Correr: `npx vitest run lib/finanzas/lo-vendido.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  cambiosEnIngresos,
  combinarLicencias,
  contratosDeLasPropuestas,
  leerLoVendido,
  MESES_DEL_CONTRATO,
  resumenDeLoVendido,
  type PropuestaGanada,
} from "./lo-vendido";
import { parteDeServicio, type LicenciaDeContrato } from "./licencias";

const propuesta = (inversion: unknown, p: Partial<PropuestaGanada> = {}): PropuestaGanada => ({
  businessCaseId: "bc1",
  nombre: "Acme - CRM",
  clientId: "c1",
  clienteNombre: "Acme",
  cuentaId: "cu1",
  versionLeida: "Propuesta 1",
  hubspotDealId: "d1",
  fechaCierre: "2026-10-05",
  monedaDeLaVenta: "USD",
  inversion,
  ...p,
});

/** Implementación de US$5.000 + Sales Hub 2 × US$100 al mes, revendida, con lista de US$150 al mes. */
const reventa = {
  moneda: "USD",
  lineas: [{ concepto: "Implementación", monto: "$5,000", recurrencia: "unica" }],
  licencias: [
    { concepto: "Sales Hub Pro", hub: "sales_hub", cantidad: "2", precioUnitario: "$100", recurrencia: "mensual", costoLista: "$150", quienFactura: "smarteam" },
  ],
};

describe("lo vendido de una propuesta", () => {
  it("separa servicio y licencia, con el margen de cada licencia", () => {
    const v = leerLoVendido(propuesta(reventa));
    expect(v.moneda).toBe("USD");
    expect(v.monedaDe).toBe("propuesta");
    expect(v.servicios).toEqual({ mensual: 0, unico: 5000 });
    expect(v.licenciasFacturadas).toEqual({ mensual: 200, unico: 0 });
    expect(v.costoLicencias).toEqual({ mensual: 150, unico: 0 });
    expect(v.margenLicencias).toEqual({ mensual: 50, unico: 0 });
    expect(v.licencias[0]).toMatchObject({ concepto: "Sales Hub Pro", hub: "sales_hub", quienFactura: "smarteam", estado: "ok" });
    expect(v.porQueNoEntra).toBeNull();
  });

  it("con el dato completo se vuelve un contrato para el equilibrio, por 12 meses desde el cierre", () => {
    const c = leerLoVendido(propuesta(reventa)).contrato!;
    expect(MESES_DEL_CONTRATO).toBe(12);
    expect(c).toMatchObject({
      id: "propuesta:bc1",
      cuentaId: "cu1",
      moneda: "USD",
      montoContrato: 5000 + 200 * 12,
      montoServicio: 5000,
      proveedor: "HubSpot",
      costoMonto: 150 * 12,
      costoMoneda: "USD",
      costoCadaMeses: 12,
      desde: "2026-10-05",
      hasta: "2027-09-30",
    });
    expect(c.fuente).toBe("Propuesta «Acme - CRM» · ganada el 2026-10-05");
  });

  it("una propuesta vieja sin el precio de lista lo dice y no inventa nada", () => {
    const vieja = { ...reventa, licencias: [{ ...reventa.licencias[0], costoLista: undefined }] };
    const v = leerLoVendido(propuesta(vieja));
    expect(v.contrato).toBeNull();
    expect(v.porQueNoEntra).toBe("Una licencia sin el precio de lista del proveedor: no se inventa.");
    expect(v.costoLicencias).toEqual({ mensual: 0, unico: 0 });
  });

  it("sin decir quién factura la licencia no entra; si la paga el cliente directo, tampoco (no pasa por Smarteam)", () => {
    const sinDecir = { ...reventa, licencias: [{ ...reventa.licencias[0], quienFactura: "" }] };
    expect(leerLoVendido(propuesta(sinDecir)).porQueNoEntra).toBe("Falta decir quién factura una licencia: no se adivina.");
    const directo = { ...reventa, licencias: [{ ...reventa.licencias[0], quienFactura: "proveedor" }] };
    const v = leerLoVendido(propuesta(directo));
    expect(v.porQueNoEntra).toBe("El cliente le paga las licencias directo al proveedor: no pasan por Smarteam.");
    expect(v.licenciasFacturadas).toEqual({ mensual: 0, unico: 0 });
  });

  it("un costo en otra moneda no se convierte: no entra", () => {
    const otra = { ...reventa, licencias: [{ ...reventa.licencias[0], costoLista: "₡80.000", costoMoneda: "CRC" }] };
    expect(leerLoVendido(propuesta(otra)).porQueNoEntra).toBe("Hay un costo en otra moneda (no se convierte).");
  });

  it("sin moneda en la propuesta usa la del trato de HubSpot, y lo declara", () => {
    const v = leerLoVendido(propuesta({ ...reventa, moneda: "" }));
    expect(v.moneda).toBe("USD");
    expect(v.monedaDe).toBe("hubspot");
    expect(v.contrato).not.toBeNull();
    const sinNada = leerLoVendido(propuesta({ ...reventa, moneda: "" }, { monedaDeLaVenta: null }));
    expect(sinNada.porQueNoEntra).toBe("Ni la propuesta ni el trato de HubSpot dicen en qué moneda está.");
  });

  it("sin cuenta de cobro no hay contra qué aplicarlo; todo servicio no tiene nada que separar", () => {
    expect(leerLoVendido(propuesta(reventa, { cuentaId: null })).porQueNoEntra).toBe(
      "El cliente no tiene cuenta de cobro: no hay cobros contra los que aplicarlo.",
    );
    expect(leerLoVendido(propuesta({ moneda: "USD", lineas: reventa.lineas })).porQueNoEntra).toBe(
      "No vende licencias: todo es servicio, no hay nada que separar.",
    );
  });

  it("lee el shape viejo de HubSpot como el render: sus «A definir» no suman y no entra", () => {
    const v = leerLoVendido(propuesta({ implementacion: { monto: "A definir" }, licenciasHubspot: { monto: "A definir" } }));
    expect(v.cobertura.lineasDeLicencia).toBe(1);
    expect(v.cobertura.pendientes).toBe(2);
    expect(v.contrato).toBeNull();
  });

  it("una línea apagada no se vendió", () => {
    const apagada = { ...reventa, licencias: [...reventa.licencias, { concepto: "Service Hub", monto: "$90", recurrencia: "mensual", activa: "no" }] };
    expect(leerLoVendido(propuesta(apagada)).licencias).toHaveLength(1);
  });

  it("el contrato anual se lleva a mes para el contrato del equilibrio", () => {
    const anual = { ...reventa, contrato: "anual", licencias: [{ ...reventa.licencias[0], precioAnual: "$1,200", costoLista: "$1,800", costoCada: "anual" }] };
    const v = leerLoVendido(propuesta(anual));
    expect(v.licenciasFacturadas.mensual).toBe(200); // 2 × 1.200 al año ÷ 12
    expect(v.costoLicencias.mensual).toBe(150);
    expect(v.contrato!.montoContrato).toBe(5000 + 2400);
  });
});

describe("cómo entra al equilibrio", () => {
  const aMano: LicenciaDeContrato = {
    id: "l1", cuentaId: "cu1", cuentaNombre: "Acme", moneda: "USD", montoContrato: 100, montoServicio: 50, proveedor: "HubSpot",
    costoMonto: null, costoMoneda: null, costoCadaMeses: null, desde: "2026-01-01", hasta: null, fuente: "Anexo", notas: null,
  };

  it("la propuesta reemplaza a la carga a mano solo en los meses que cubre", () => {
    const todas = combinarLicencias([aMano], contratosDeLasPropuestas([leerLoVendido(propuesta(reventa))]));
    expect(todas[0]!.id).toBe("propuesta:bc1");
    expect(parteDeServicio(todas, "cu1", "USD", "2026-09")).toBe(0.5); // antes del cierre: la carga a mano
    expect(parteDeServicio(todas, "cu1", "USD", "2026-11")).toBeCloseTo(5000 / 7400, 6); // en la propuesta
    expect(parteDeServicio(todas, "cu1", "USD", "2027-10")).toBe(0.5); // después de los 12 meses
  });

  it("qué cambia mes a mes en lo facturado, cada moneda aparte", () => {
    const despues = combinarLicencias([], contratosDeLasPropuestas([leerLoVendido(propuesta(reventa))]));
    const cobros = [
      { cuentaId: "cu1", moneda: "USD", periodoDelCobro: "2026-11", periodo: "2026-11", monto: 740 },
      { cuentaId: "cu1", moneda: "USD", periodoDelCobro: "2026-09", periodo: "2026-09", monto: 1000 }, // fuera: no cambia
      { cuentaId: "cu1", moneda: "CRC", periodoDelCobro: "2026-11", periodo: "2026-11", monto: 5000 }, // otra moneda: no cambia
    ];
    expect(cambiosEnIngresos(cobros, [], despues)).toEqual([
      {
        cuentaId: "cu1", moneda: "USD", periodo: "2026-11", facturado: 740,
        servicioAntes: 740, servicioDespues: 500, licenciaAntes: 0, licenciaDespues: 240, contratoDespues: "propuesta:bc1",
      },
    ]);
  });

  it("el resumen cuenta las ganadas, las que venden licencias y las que entran", () => {
    const r = resumenDeLoVendido([
      leerLoVendido(propuesta(reventa)),
      leerLoVendido(propuesta({ moneda: "USD", lineas: reventa.lineas }, { businessCaseId: "bc2", fechaCierre: "2026-09-01" })),
    ]);
    expect(r).toMatchObject({ ganadas: 2, conLicencias: 1, entran: 1 });
    expect(r.propuestas[0]).toMatchObject({ businessCaseId: "bc1", servicioEnElContrato: 5000, licenciasEnElContrato: 2400, margenEnElContrato: 600, entra: true });
    expect(r.propuestas[1]).toMatchObject({ entra: false, margenEnElContrato: null });
  });
});
