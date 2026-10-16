/**
 * lib/cobranza/quien-debe.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/quien-debe.test.ts --project unit`.
 *
 * «Quién nos debe» (2026-10-16): la cola de cobros juntada por cliente, con las mismas reglas de la cola.
 */
import { describe, expect, it } from "vitest";
import { quienNosDebe, type CuotaQueSeDebe } from "./quien-debe";

const HOY = "2026-10-16";
let n = 0;
const cuota = (cliente: string, p: Partial<CuotaQueSeDebe>): CuotaQueSeDebe => ({
  id: `c${++n}`,
  cuentaId: `cta-${cliente}`,
  clientId: `cli-${cliente}`,
  clienteNombre: cliente,
  tipoCuenta: "NACIONAL",
  servicioDescripcion: null,
  periodo: "2026-09",
  numeroFactura: null,
  promesaPago: null,
  estado: "POR_COBRAR",
  fechaProgramada: "2026-09-15",
  fechaEmision: "2026-09-15",
  creditoDias: 15,
  monto: 1000,
  moneda: "USD",
  ...p,
});

describe("qué se debe y dónde cae", () => {
  it("vencido, por vencer y falta facturar por separado; lo programado por delante no se debe", () => {
    const r = quienNosDebe(
      [
        cuota("kölbi", { numeroFactura: "FAC/2026/0332", fechaProgramada: "2026-08-26", fechaEmision: "2026-08-26", monto: 13475 }),
        cuota("kölbi", { numeroFactura: "FAC/2026/0343", fechaProgramada: "2026-09-10", fechaEmision: "2026-09-10", monto: 11541249.95, moneda: "CRC" }),
        cuota("kölbi", { numeroFactura: "FAC/2026/0369", fechaProgramada: "2026-10-07", fechaEmision: "2026-10-07", monto: 13475 }),
        cuota("kölbi", { estado: "PROGRAMADO", fechaProgramada: "2026-11-15", fechaEmision: null, monto: 13475 }),
        cuota("Intercert", { estado: "PROGRAMADO", fechaProgramada: "2026-09-30", fechaEmision: null, monto: 1000 }),
      ],
      HOY,
    );
    const kolbi = r.filas.find((f) => f.cliente === "kölbi")!;
    expect(kolbi.montos.USD).toEqual({ vencido: 13475, porVencer: 13475, faltaFacturar: 0 });
    expect(kolbi.montos.CRC).toEqual({ vencido: 11541249.95, porVencer: 0, faltaFacturar: 0 });
    expect(kolbi.debeDesde).toBe("2026-08-26");
    expect(kolbi.proximo).toEqual({ fecha: "2026-11-15", monto: 13475, moneda: "USD" });
    // Intercert solo tiene algo atrasado sin facturar: está en la lista, pero no como deuda del cliente.
    const intercert = r.filas.find((f) => f.cliente === "Intercert")!;
    expect(intercert.montos.USD).toEqual({ vencido: 0, porVencer: 0, faltaFacturar: 1000 });
  });

  it("⛔ nunca suma monedas: los totales van por moneda y cuentan los clientes con vencido", () => {
    const r = quienNosDebe(
      [cuota("A", { monto: 500 }), cuota("B", { monto: 300 }), cuota("B", { monto: 200000, moneda: "CRC" })],
      HOY,
    );
    expect(r.totales.USD).toEqual({ vencido: 800, porVencer: 0, faltaFacturar: 0, clientesConVencido: 2 });
    expect(r.totales.CRC).toEqual({ vencido: 200000, porVencer: 0, faltaFacturar: 0, clientesConVencido: 1 });
  });

  it("un cliente con todo por delante no aparece; lo cobrado tampoco", () => {
    const r = quienNosDebe(
      [cuota("Futuro", { estado: "PROGRAMADO", fechaProgramada: "2026-12-15", fechaEmision: null }), cuota("Pagado", { estado: "COBRADO" })],
      HOY,
    );
    expect(r.filas).toEqual([]);
  });
});

describe("el orden y lo que acompaña a cada cliente", () => {
  it("primero lo vencido (lo más viejo arriba), después lo que está en plazo, al final lo que falta facturar", () => {
    const r = quienNosDebe(
      [
        cuota("Plazo", { fechaProgramada: "2026-10-15", fechaEmision: "2026-10-15" }),
        cuota("Reciente", { fechaProgramada: "2026-09-20", fechaEmision: "2026-09-20" }),
        cuota("Viejo", { fechaProgramada: "2026-05-15", fechaEmision: "2026-05-15" }),
        cuota("SinFactura", { estado: "PROGRAMADO", fechaProgramada: "2026-09-01", fechaEmision: null }),
      ],
      HOY,
    );
    expect(r.filas.map((f) => f.cliente)).toEqual(["Viejo", "Reciente", "Plazo", "SinFactura"]);
  });

  it("la promesa que importa es la incumplida; y el último contacto viene de la bitácora", () => {
    const r = quienNosDebe(
      [
        cuota("Honda", { promesaPago: "2026-10-30" }),
        cuota("Honda", { promesaPago: "2026-10-01", fechaProgramada: "2026-08-15", fechaEmision: "2026-08-15" }),
      ],
      HOY,
      new Map([["cta-Honda", { fecha: "2026-10-10", tipo: "LLAMADA", quien: "aarrieta@smarteamcr.com" }]]),
    );
    expect(r.filas[0]!.promesa).toEqual({ fecha: "2026-10-01", incumplida: true });
    expect(r.filas[0]!.ultimoContacto).toEqual({ fecha: "2026-10-10", tipo: "LLAMADA", quien: "aarrieta@smarteamcr.com" });
  });
});
