/**
 * lib/finanzas/licencias-escritura-server.ts — crear, editar y archivar los contratos con licencias revendidas
 * (2026-10-17). Server-only. Las reglas de lo que se puede guardar viven en lib/finanzas/licencias.ts
 * (`problemasDeLicencia`); la base las repite con sus CHECK.
 *
 * Aparte de licencias-server.ts a propósito: ese lo importa lib/cobranza/queries.ts, y esto usa `CobranzaError` de
 * mutations.ts, que importa queries.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { problemasDeLicencia, type DatosDeLicencia } from "./licencias";

const dia = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

function aFila(d: DatosDeLicencia) {
  return {
    moneda: d.moneda,
    montoContrato: d.montoContrato,
    montoServicio: d.montoServicio,
    proveedor: d.proveedor.trim() || "HubSpot",
    costoMonto: d.costoMonto,
    costoMoneda: d.costoMoneda,
    costoCadaMeses: d.costoCadaMeses,
    desde: dia(d.desde),
    hasta: dia(d.hasta),
    fuente: d.fuente.trim(),
    notas: d.notas?.trim() || null,
  };
}

function validar(d: DatosDeLicencia) {
  const problemas = problemasDeLicencia(d);
  if (problemas.length) throw new CobranzaError(problemas.join(" "), 400);
}

/** El índice único (una viva por cuenta y moneda) se dice en palabras. */
function traducirChoque(e: unknown): never {
  if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
    throw new CobranzaError("Esa cuenta ya tiene un contrato con licencias en esa moneda: edítalo o archívalo primero.", 409);
  }
  throw e;
}

export async function crearLicencia(d: DatosDeLicencia, actor: string): Promise<string> {
  validar(d);
  const cuenta = await prisma.cuentaFinanciera.findUnique({ where: { id: d.cuentaId }, select: { id: true } });
  if (!cuenta) throw new CobranzaError("Esa cuenta no existe.", 404);
  try {
    const l = await prisma.licenciaRevendida.create({ data: { cuentaId: d.cuentaId, ...aFila(d), creadoPor: actor, actualizadoPor: actor }, select: { id: true } });
    return l.id;
  } catch (e) {
    traducirChoque(e);
  }
}

export async function actualizarLicencia(id: string, d: Omit<DatosDeLicencia, "cuentaId">, actor: string): Promise<void> {
  const actual = await prisma.licenciaRevendida.findUnique({ where: { id }, select: { cuentaId: true, archivadaEn: true } });
  if (!actual || actual.archivadaEn) throw new CobranzaError("Ese contrato no existe o ya está archivado.", 404);
  validar({ ...d, cuentaId: actual.cuentaId });
  try {
    await prisma.licenciaRevendida.update({ where: { id }, data: { ...aFila({ ...d, cuentaId: actual.cuentaId }), actualizadoPor: actor } });
  } catch (e) {
    traducirChoque(e);
  }
}

/** Archivar y no borrar: lo que ya se leyó con este contrato se puede explicar después. */
export async function archivarLicencia(id: string, actor: string): Promise<void> {
  const r = await prisma.licenciaRevendida.updateMany({ where: { id, archivadaEn: null }, data: { archivadaEn: new Date(), archivadaPor: actor, actualizadoPor: actor } });
  if (r.count === 0) throw new CobranzaError("Ese contrato no existe o ya está archivado.", 404);
}

/** Las cuentas de cobro, para elegir a cuál le corresponde un contrato. */
export async function cuentasParaLicencias(): Promise<Array<{ cuentaId: string; nombre: string }>> {
  const cuentas = await prisma.cuentaFinanciera.findMany({ select: { id: true, client: { select: { name: true } } } });
  return cuentas.map((c) => ({ cuentaId: c.id, nombre: c.client.name })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
