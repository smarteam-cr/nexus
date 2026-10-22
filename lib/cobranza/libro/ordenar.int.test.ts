/**
 * lib/cobranza/libro/ordenar.int.test.ts — lo que Nexus ordena solo, de punta a punta contra una base REAL (2026-10-22).
 *
 * Una factura de Odoo pagada que cubre dos cuotas ya cobradas y sin número (Amvac FAC/2026/0310): Nexus anota el número
 * en las dos con la firma del sistema, guarda lo que había antes y no mueve plata. «Deshacer» las devuelve a como
 * estaban, y Nexus no las vuelve a ordenar. Si alguien tocó una cuota entretanto, deshacer no pisa lo suyo.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { deshacerOrden, ordenarLoSeguro } from "./ordenar-server";

const QUIEN = "mzamora@test.local";
const HOY = "2026-10-22";

async function armar() {
  const client = await prisma.client.create({ data: { name: "Amvac Latam" } });
  const cuenta = await prisma.cuentaFinanciera.create({ data: { clientId: client.id, viaCobro: "ODOO" } });
  const servicio = await prisma.servicioContratado.create({
    data: { cuentaId: cuenta.id, tipoServicio: "SUSCRIPCION", modalidad: "RECURRENTE", montoTotal: 3696, moneda: "USD" },
  });
  const cuota = (periodo: string) =>
    prisma.cobro.create({
      data: {
        servicioId: servicio.id,
        cuentaId: cuenta.id,
        periodo,
        fechaProgramada: new Date(`${periodo}-15T00:00:00Z`),
        monto: 1848,
        moneda: "USD",
        estado: "COBRADO",
        fechaEmision: new Date(`${periodo}-15T00:00:00Z`),
        facturadoPor: QUIEN,
        facturadoEn: new Date(),
        fechaCobro: new Date(`${periodo}-28T00:00:00Z`),
        confirmadoPor: QUIEN,
        confirmadoEn: new Date(),
      },
    });
  const [mayo, junio] = [await cuota("2026-05"), await cuota("2026-06")];
  await prisma.facturaOdoo.create({
    data: {
      odooMoveId: 310,
      numero: "FAC/2026/0310",
      moveType: "out_invoice",
      state: "posted",
      paymentState: "paid",
      invoiceDate: new Date("2026-06-03T00:00:00Z"),
      montoNeto: 3696,
      montoTotal: 4176.48,
      montoResidual: 0,
      montoImpuesto: 480.48,
      montoTotalSigned: 4176.48,
      moneda: "USD",
      odooPartnerId: 1,
      odooPartnerNombre: "Amvac Latam SA",
      cuentaId: cuenta.id,
      sincronizadoEn: new Date(),
    },
  });
  return { mayo, junio };
}

describe("lo que Nexus ordena solo", () => {
  it("anota la factura en las dos cuotas, sin mover plata, y se deshace entero", async () => {
    const { mayo, junio } = await armar();

    const simulacro = await ordenarLoSeguro({ aplicar: false, hoy: HOY });
    expect(simulacro.ordenes.map((o) => o.numero)).toEqual(["FAC/2026/0310"]);
    expect(await prisma.ordenDelSistema.count()).toBe(0);

    const r = await ordenarLoSeguro({ aplicar: true, hoy: HOY });
    expect(r.escritas).toBe(1);
    expect(r.saltadas).toEqual([]);
    const ordenadas = await prisma.cobro.findMany({ where: { id: { in: [mayo.id, junio.id] } }, orderBy: { periodo: "asc" } });
    expect(ordenadas.map((c) => c.numeroFactura)).toEqual(["FAC/2026/0310", "FAC/2026/0310"]);
    expect(ordenadas.every((c) => c.numeroFacturaPor === "sistema:odoo" && c.estado === "COBRADO" && Number(c.monto) === 1848)).toBe(true);
    expect(await prisma.ordenDelSistema.count()).toBe(2);

    // Correrlo otra vez no hace nada: ya tienen su número.
    expect((await ordenarLoSeguro({ aplicar: true, hoy: HOY })).ordenes).toEqual([]);

    const grupo = (await prisma.ordenDelSistema.findFirstOrThrow()).grupo;
    expect(await deshacerOrden(grupo, QUIEN)).toEqual({ cuotas: 2 });
    const deshechas = await prisma.cobro.findMany({ where: { id: { in: [mayo.id, junio.id] } } });
    expect(deshechas.every((c) => c.numeroFactura === null && c.numeroFacturaPor === null && c.facturadoPor === QUIEN)).toBe(true);
    expect(await prisma.ordenDelSistema.count({ where: { deshechoPor: QUIEN } })).toBe(2);

    // Lo deshecho no se vuelve a ordenar.
    expect((await ordenarLoSeguro({ aplicar: false, hoy: HOY })).ordenes).toEqual([]);
  });

  it("si alguien tocó una cuota después, deshacer no pisa lo suyo", async () => {
    const { mayo } = await armar();
    await ordenarLoSeguro({ aplicar: true, hoy: HOY });
    await prisma.cobro.update({ where: { id: mayo.id }, data: { numeroFactura: "FAC/2026/0999" } });
    const grupo = (await prisma.ordenDelSistema.findFirstOrThrow()).grupo;
    await expect(deshacerOrden(grupo, QUIEN)).rejects.toThrow(/cambió desde que Nexus la ordenó/);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: mayo.id } })).numeroFactura).toBe("FAC/2026/0999");
    expect(await prisma.ordenDelSistema.count({ where: { deshechoEn: { not: null } } })).toBe(0);
  });
});
