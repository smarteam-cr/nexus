/**
 * lib/finanzas/supervision.test.ts — lo que calcula Finanzas › Supervisión (auditoría 2026-10-05, Q10).
 *
 * supervision.ts no tenía prueba: es puro, y lo que muestra (las decisiones que esperan a quien supervisa y la cobranza
 * que se complica) sale de las mismas reglas que Conciliación y Cobranza. Esto fija lo que hace hoy, sin cambiarlo.
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import type { DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import { cobranzaQueSeComplica, decisionesPendientes } from "./supervision";

/** Una línea mínima de Conciliación: solo lo que mira la lista de decisiones. */
const linea = (codigo: string, p: { donde?: string; filas?: number; plata?: Array<{ moneda: string; monto: number }> } = {}) =>
  ({
    codigo,
    titulo: `Título de ${codigo}`,
    detalle: `Detalle de ${codigo}`,
    donde: p.donde ?? "NEXUS",
    items: Array.from({ length: p.filas ?? 1 }, () => ({})),
    plata: (p.plata ?? []).map((x, i) => ({ clave: `f:${i}`, ...x })),
  }) as unknown as DiferenciaOdoo;

describe("decisionesPendientes", () => {
  const lista = [
    linea("ODOO-COBRADO-SIN-PAGAR", { donde: "PREGUNTANDO", filas: 2, plata: [{ moneda: "USD", monto: 1500 }, { moneda: "USD", monto: 500 }] }),
    linea("ODOO-SIN-CUENTA", { donde: "NEXUS", filas: 3 }),
    linea("MERCURY-ENTRADA-SIN-FACTURA", { donde: "PREGUNTANDO", filas: 1 }),
    linea("ODOO-YA-DECIDIDA", { donde: "PREGUNTANDO", filas: 0 }),
  ];

  it("solo las que esperan una decisión y todavía tienen filas, en el orden de la lista", () => {
    expect(decisionesPendientes(lista).map((d) => d.codigo)).toEqual(["ODOO-COBRADO-SIN-PAGAR", "MERCURY-ENTRADA-SIN-FACTURA"]);
  });

  it("cada una con su origen, su plata por moneda (vacía si no la cuantifica) y cuántas filas", () => {
    expect(decisionesPendientes(lista)).toEqual([
      {
        codigo: "ODOO-COBRADO-SIN-PAGAR",
        fuente: "Odoo",
        titulo: "Título de ODOO-COBRADO-SIN-PAGAR",
        detalle: "Detalle de ODOO-COBRADO-SIN-PAGAR",
        plata: "US$2.000",
        filas: 2,
      },
      {
        codigo: "MERCURY-ENTRADA-SIN-FACTURA",
        fuente: "Mercury",
        titulo: "Título de MERCURY-ENTRADA-SIN-FACTURA",
        detalle: "Detalle de MERCURY-ENTRADA-SIN-FACTURA",
        plata: "",
        filas: 1,
      },
    ]);
  });
});

describe("cobranzaQueSeComplica", () => {
  const HOY = "2026-10-05";
  /** Una cuota facturada el mismo día en que estaba programada. */
  const cuota = (clienteNombre: string, fecha: string, monto: number, moneda = "USD", promesaPago: string | null = null) => ({
    clienteNombre,
    estado: "PROGRAMADO",
    fechaProgramada: fecha,
    fechaEmision: fecha,
    promesaPago,
    monto,
    moneda,
  });
  const cola = [
    cuota("Metzger", "2026-05-01", 925), // 157 días
    cuota("Teamnet", "2026-06-01", 2000), // 126 días
    cuota("Teamnet", "2026-07-01", 2000), // 96 días
    cuota("Beta", "2026-04-01", 1_000_000, "CRC"), // 187 días
    cuota("Alfa", "2026-09-01", 500, "USD", "2026-09-20"), // 34 días, con la promesa rota
    cuota("Gamma", "2026-10-10", 300), // todavía no vence
    { ...cuota("Delta", "2026-03-01", 700), estado: "COBRADO" }, // cobrado: no cuenta
  ];
  const r = cobranzaQueSeComplica(cola, HOY);

  it("lo vencido a más de 90 días, por moneda y cuántas cuotas", () => {
    expect(r.nMas90).toBe(4);
    expect([...r.mas90].sort((a, b) => a.moneda.localeCompare(b.moneda))).toEqual([
      { moneda: "CRC", monto: 1_000_000 },
      { moneda: "USD", monto: 4925 },
    ]);
  });

  it("las promesas rotas se cuentan aparte, estén o no a más de 90 días", () => {
    expect(r.nPromesas).toBe(1);
    expect(r.promesas).toEqual([{ moneda: "USD", monto: 500 }]);
  });

  it("los tres clientes con lo más viejo, el más viejo primero; con varias cuotas lo dice", () => {
    expect(r.clientes).toEqual([
      { cliente: "Beta", texto: "₡1.000.000 · 187 días" },
      { cliente: "Metzger", texto: "US$925 · 157 días" },
      { cliente: "Teamnet", texto: "2 cuotas, US$4.000 · la más vieja de 126 días" },
    ]);
  });

  it("en la lista de clientes solo entra lo de más de 90 días: una promesa rota de 34 días no", () => {
    const corta = cobranzaQueSeComplica([cuota("Metzger", "2026-05-01", 925), cuota("Alfa", "2026-09-01", 500, "USD", "2026-09-20")], HOY);
    expect(corta.clientes.map((c) => c.cliente)).toEqual(["Metzger"]);
  });

  it("sin nada complicado, todo vacío", () => {
    expect(cobranzaQueSeComplica([cuota("Gamma", "2026-10-10", 300)], HOY)).toEqual({ mas90: [], nMas90: 0, promesas: [], nPromesas: 0, clientes: [] });
  });
});
