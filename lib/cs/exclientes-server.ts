/**
 * lib/cs/exclientes-server.ts — qué cuentas están marcadas «excliente» (la regla: ./exclientes.ts). SERVER-ONLY.
 *
 * Una consulta chica (las filas de `ClasificacionDeCuenta` con la relación confirmada «excliente»). Sin la tabla, no
 * hay exclientes: nada se esconde.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { faltaLaTabla } from "./clasificacion-server";
import { EXCLIENTE } from "./exclientes";

/** Las cuentas confirmadas como excliente (de `clientIds`, o todas). */
export async function cuentasExcliente(clientIds?: readonly string[]): Promise<Set<string>> {
  if (clientIds && clientIds.length === 0) return new Set();
  try {
    const filas = await prisma.clasificacionDeCuenta.findMany({
      where: { relacion: EXCLIENTE, ...(clientIds ? { clientId: { in: [...clientIds] } } : {}) },
      select: { clientId: true },
    });
    return new Set(filas.map((f) => f.clientId));
  } catch (e) {
    if (faltaLaTabla(e)) return new Set();
    throw e;
  }
}

/** ¿Esta cuenta está confirmada como excliente? */
export async function esCuentaExcliente(clientId: string): Promise<boolean> {
  return (await cuentasExcliente([clientId])).has(clientId);
}
