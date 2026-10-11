/**
 * lib/cs/clasificacion-server.ts — leer y guardar la clasificación de las cuentas (`ClasificacionDeCuenta`).
 *
 * Solo lo confirmado y lo descartado: la propuesta la calcula `lib/cs/clasificacion.ts` al leer.
 *
 * ── SIN LA TABLA NO SE CAE NADA ─────────────────────────────────────────────────────────────
 * Si el SQL (scripts/sql/2026-10-07-clasificacion-de-cuenta.sql) todavía no corrió, leer devuelve nada
 * confirmado y lo dice (`faltaLaTabla`): la cartera se ve igual, con las propuestas. Guardar responde 503.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leerDescartes, type ClasificacionGuardada, type OperacionDeClasificacion } from "./clasificacion";

const SELECT = {
  clientId: true,
  relacion: true,
  relacionPor: true,
  relacionEn: true,
  potencial: true,
  potencialPor: true,
  potencialEn: true,
  momento: true,
  momentoPor: true,
  momentoEn: true,
  descartes: true,
} as const;

type Fila = Prisma.ClasificacionDeCuentaGetPayload<{ select: typeof SELECT }>;

function guardadaDesdeFila(f: Fila): ClasificacionGuardada {
  return {
    relacion: f.relacion,
    relacionPor: f.relacionPor,
    relacionEn: f.relacionEn?.toISOString() ?? null,
    potencial: f.potencial,
    potencialPor: f.potencialPor,
    potencialEn: f.potencialEn?.toISOString() ?? null,
    momento: f.momento,
    momentoPor: f.momentoPor,
    momentoEn: f.momentoEn?.toISOString() ?? null,
    descartes: leerDescartes(f.descartes),
  };
}

/** La tabla (o una columna) todavía no existe en la base. */
export function faltaLaTabla(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022");
}

export async function leerClasificaciones(
  clientIds: readonly string[],
): Promise<{ porCliente: Map<string, ClasificacionGuardada>; faltaLaTabla: boolean }> {
  const porCliente = new Map<string, ClasificacionGuardada>();
  if (clientIds.length === 0) return { porCliente, faltaLaTabla: false };
  try {
    const filas = await prisma.clasificacionDeCuenta.findMany({ where: { clientId: { in: [...clientIds] } }, select: SELECT });
    for (const f of filas) porCliente.set(f.clientId, guardadaDesdeFila(f));
    return { porCliente, faltaLaTabla: false };
  } catch (e) {
    if (faltaLaTabla(e)) return { porCliente, faltaLaTabla: true };
    throw e;
  }
}

/**
 * Confirma valores o descarta propuestas de una cuenta, en una transacción. Confirmar borra el descarte de ese
 * dato: lo que se había descartado antes ya no viene al caso. Devuelve cómo quedó.
 */
export async function aplicarOperacionesDeClasificacion(
  clientId: string,
  operaciones: readonly OperacionDeClasificacion[],
  email: string,
): Promise<ClasificacionGuardada> {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.clasificacionDeCuenta.findUnique({ where: { clientId }, select: SELECT });
    const descartes = leerDescartes(antes?.descartes ?? null);
    const cambios: Prisma.ClasificacionDeCuentaUncheckedUpdateInput = {};
    const ahora = new Date();
    for (const op of operaciones) {
      if (op.accion === "confirmar") {
        cambios[op.dato] = op.valor;
        cambios[`${op.dato}Por` as const] = email;
        cambios[`${op.dato}En` as const] = ahora;
        delete descartes[op.dato];
      } else {
        descartes[op.dato] = { valor: op.valor, huella: op.huella };
      }
    }
    const descartesJson = descartes as Prisma.InputJsonValue;
    const fila = await tx.clasificacionDeCuenta.upsert({
      where: { clientId },
      create: { ...(cambios as Prisma.ClasificacionDeCuentaUncheckedCreateInput), clientId, descartes: descartesJson },
      update: { ...cambios, descartes: descartesJson },
      select: SELECT,
    });
    return guardadaDesdeFila(fila);
  });
}
