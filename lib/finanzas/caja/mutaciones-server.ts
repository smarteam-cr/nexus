/**
 * lib/finanzas/caja/mutaciones-server.ts — lo que escribe «Dónde está la plata» (2026-11-13). Server-only.
 *
 * Saldos a mano, cuentas, pagos comprometidos y reservas, y la revisión del día. Nada de esto toca un cobro ni un costo:
 * un pago comprometido solo APUNTA al cobro del que depende (escenario A), y lo lee.
 * Las cuentas y los saldos de Mercury los escribe su copia (lib/cobranza/mercury/sync.ts), no una persona.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { z } from "zod";
import type { accionDeCompromisoSchema, compromisoSchema, cuentaCambioSchema, cuentaNuevaSchema, saldoSchema } from "./esquemas";

const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const diaONull = (iso: string | null) => (iso ? dia(iso) : null);

export class ErrorDeCaja extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export async function guardarSaldo(input: z.infer<typeof saldoSchema>, quien: string) {
  const cuenta = await prisma.cuentaDeBanco.findUnique({ where: { id: input.cuentaId }, select: { origen: true } });
  if (!cuenta) throw new ErrorDeCaja("Esa cuenta no existe.", 404);
  if (cuenta.origen === "MERCURY") throw new ErrorDeCaja("El saldo de Mercury lo trae su copia diaria: no se carga a mano.", 409);
  const fecha = dia(input.fecha);
  return prisma.saldoDeCuenta.upsert({
    where: { cuentaId_fecha: { cuentaId: input.cuentaId, fecha } },
    create: { cuentaId: input.cuentaId, fecha, monto: input.monto, origen: "MANUAL", registradoPor: quien, nota: input.nota },
    update: { monto: input.monto, registradoPor: quien, nota: input.nota },
  });
}

/** La sociedad tiene que estar en la lista oficial. */
async function asegurarSociedad(sociedadId: string | null | undefined) {
  if (!sociedadId) return;
  const s = await prisma.sociedadPropia.findUnique({ where: { id: sociedadId }, select: { id: true } });
  if (!s) throw new ErrorDeCaja("Esa sociedad no está en la lista de sociedades.", 400);
}

export async function crearCuenta(input: z.infer<typeof cuentaNuevaSchema>) {
  await asegurarSociedad(input.sociedadId);
  const orden = (await prisma.cuentaDeBanco.aggregate({ _max: { orden: true } }))._max.orden ?? 0;
  return prisma.cuentaDeBanco.create({
    data: { nombre: input.nombre, moneda: input.moneda, sociedadId: input.sociedadId, origen: "MANUAL", orden: orden + 1 },
  });
}

export async function cambiarCuenta(id: string, input: z.infer<typeof cuentaCambioSchema>) {
  const existe = await prisma.cuentaDeBanco.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new ErrorDeCaja("Esa cuenta no existe.", 404);
  await asegurarSociedad(input.sociedadId);
  return prisma.cuentaDeBanco.update({
    where: { id },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.sociedadId !== undefined ? { sociedadId: input.sociedadId } : {}),
      ...(input.activa !== undefined ? { activa: input.activa } : {}),
    },
  });
}

function datosDeCompromiso(d: z.infer<typeof compromisoSchema>) {
  return {
    tipo: d.tipo,
    concepto: d.concepto,
    beneficiario: d.beneficiario,
    categoria: d.categoria,
    monto: d.monto,
    moneda: d.moneda,
    fecha: diaONull(d.fecha),
    facturaRecibidaEl: diaONull(d.facturaRecibidaEl),
    entregadoEl: diaONull(d.entregadoEl),
    adelantoPct: d.tipo === "PAGO" && d.categoria === "ARTICULO_FISICO" ? d.adelantoPct : 0,
    cobroId: d.cobroId,
    sociedadId: d.sociedadId,
    nota: d.nota,
  };
}

async function asegurarCobro(cobroId: string | null) {
  if (!cobroId) return;
  const c = await prisma.cobro.findUnique({ where: { id: cobroId }, select: { id: true } });
  if (!c) throw new ErrorDeCaja("Ese cobro no existe.", 400);
}

export async function crearCompromiso(d: z.infer<typeof compromisoSchema>, quien: string) {
  await asegurarCobro(d.cobroId);
  return prisma.pagoComprometido.create({ data: { ...datosDeCompromiso(d), registradoPor: quien } });
}

export async function accionSobreCompromiso(id: string, a: z.infer<typeof accionDeCompromisoSchema>, quien: string) {
  const c = await prisma.pagoComprometido.findUnique({ where: { id }, select: { estado: true, tipo: true, adelantoPct: true } });
  if (!c) throw new ErrorDeCaja("Ese pago no existe.", 404);
  switch (a.accion) {
    case "pagar":
      if (c.estado !== "PENDIENTE") throw new ErrorDeCaja("Solo se marca pagado lo que está pendiente.", 409);
      return prisma.pagoComprometido.update({ where: { id }, data: { estado: "PAGADO", pagadoEl: dia(a.fecha), pagadoPor: quien } });
    case "pagarAdelanto":
      if (c.estado !== "PENDIENTE" || c.adelantoPct === 0) throw new ErrorDeCaja("Este pago no tiene un adelanto pendiente.", 409);
      return prisma.pagoComprometido.update({ where: { id }, data: { adelantoPagadoEl: dia(a.fecha) } });
    case "anular":
      if (c.estado !== "PENDIENTE") throw new ErrorDeCaja("Solo se anula lo que está pendiente.", 409);
      return prisma.pagoComprometido.update({ where: { id }, data: { estado: "ANULADO" } });
    case "reabrir":
      if (c.estado === "PENDIENTE") throw new ErrorDeCaja("Ya está pendiente.", 409);
      return prisma.pagoComprometido.update({ where: { id }, data: { estado: "PENDIENTE", pagadoEl: null, pagadoPor: null } });
    case "editar":
      if (c.estado !== "PENDIENTE") throw new ErrorDeCaja("Lo pagado o anulado no se edita: reábrelo primero.", 409);
      await asegurarCobro(a.datos.cobroId);
      return prisma.pagoComprometido.update({ where: { id }, data: datosDeCompromiso(a.datos) });
  }
}

/** La revisión del día: una por fecha; volver a marcarla actualiza quién y cuándo. */
export async function marcarRevision(hoyISO: string, quien: string, nota: string | null, ahora: Date) {
  const fecha = dia(hoyISO);
  return prisma.revisionDeCaja.upsert({
    where: { fecha },
    create: { fecha, revisadoPor: quien, revisadoEn: ahora, nota },
    update: { revisadoPor: quien, revisadoEn: ahora, nota },
  });
}
