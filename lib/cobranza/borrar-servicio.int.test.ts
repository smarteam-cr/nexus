/**
 * lib/cobranza/borrar-servicio.int.test.ts — eliminar un servicio de Cobranza, de punta a punta, contra una base REAL
 * (2026-10-30, feedback #18). La regla suelta la cubre borrar-servicio.test.ts; esto prueba que el borrado la cumpla:
 * si alguien quita el freno, estos casos se ponen en rojo. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { CobranzaError, deleteServicio } from "./mutations";

const QUIEN = "aarrieta@test.local";

async function armar(estado: "FINALIZADO" | "ACTIVO" = "FINALIZADO") {
  const client = await prisma.client.create({ data: { name: "Honda Costa Rica" } });
  const cuenta = await prisma.cuentaFinanciera.create({ data: { clientId: client.id, viaCobro: "ODOO" } });
  const servicio = await prisma.servicioContratado.create({
    data: { cuentaId: cuenta.id, tipoServicio: "OTRO", modalidad: "RECURRENTE", montoTotal: 24000, moneda: "USD", estado, descripcion: "Programa Anual" },
  });
  return { cuenta, servicio };
}

const cuota = (a: Awaited<ReturnType<typeof armar>>, extra: Record<string, unknown> = {}) =>
  prisma.cobro.create({
    data: {
      servicioId: a.servicio.id,
      cuentaId: a.cuenta.id,
      periodo: "2026-10",
      fechaProgramada: new Date("2026-10-15T00:00:00Z"),
      monto: 2000,
      moneda: "USD",
      ...extra,
    },
  });

async function rechazo(id: string): Promise<CobranzaError> {
  const e = await deleteServicio(id, QUIEN).then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(CobranzaError);
  expect((e as CobranzaError).status).toBe(409);
  expect(await prisma.servicioContratado.count({ where: { id } })).toBe(1);
  return e as CobranzaError;
}

describe("deleteServicio", () => {
  it("borra el finalizado limpio con sus cobros y deja la línea en la bitácora", async () => {
    const a = await armar();
    await cuota(a);
    await deleteServicio(a.servicio.id, QUIEN);

    expect(await prisma.servicioContratado.count({ where: { id: a.servicio.id } })).toBe(0);
    expect(await prisma.cobro.count({ where: { cuentaId: a.cuenta.id } })).toBe(0);
    const [linea] = await prisma.bitacoraCobro.findMany({ where: { cuentaId: a.cuenta.id } });
    expect(linea.contenido).toContain("«Programa Anual»");
    expect(linea.contenido).toContain("USD 24000");
    expect(linea.contenido).toContain("1 cobro(s) sin cobrar");
    expect(linea.usuarioEmail).toBe(QUIEN);
  });

  it("no toca un contrato vivo", async () => {
    const a = await armar("ACTIVO");
    expect((await rechazo(a.servicio.id)).message).toContain("márcalo Finalizado");
  });

  it("no se lleva la plata cobrada", async () => {
    const a = await armar();
    await cuota(a, { estado: "COBRADO", fechaCobro: new Date("2026-10-15T00:00:00Z"), fechaEmision: new Date("2026-10-15T00:00:00Z"), confirmadoPor: QUIEN, confirmadoEn: new Date() });
    expect((await rechazo(a.servicio.id)).message).toContain("1 cobro ya cobrado");
  });

  it("no deja suelta una factura emitida", async () => {
    const a = await armar();
    await cuota(a, { estado: "POR_COBRAR", numeroFactura: "FAC/2026/0349" });
    expect((await rechazo(a.servicio.id)).message).toContain("quedaría suelta");
  });

  it("no se lleva la regla de comisión de la venta, y lo que dice no cuenta cuál es", async () => {
    const a = await armar();
    const vendedor = await prisma.teamMember.create({ data: { name: "Andrés Pinzón", email: "ventas@test.local", area: "Ventas", roleEnum: "VENTAS" } });
    await prisma.reglaComisionVendedor.create({
      data: { teamMemberId: vendedor.id, servicioId: a.servicio.id, porcentaje: 5, vigenteDesde: new Date("2026-01-01T00:00:00Z") },
    });
    const { message } = await rechazo(a.servicio.id);
    expect(message).toContain("Comisiones");
    expect(message).not.toContain("5");
  });

  it("el que no existe responde que no existe", async () => {
    await expect(deleteServicio("no-existe", QUIEN)).rejects.toMatchObject({ status: 404 });
  });
});
