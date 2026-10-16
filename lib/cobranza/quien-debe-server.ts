/**
 * lib/cobranza/quien-debe-server.ts — lo que «Quién nos debe» lee de la base además de la cola: la última vez que se
 * habló con cada cliente (2026-10-16). Solo llamadas y correos de la bitácora: una nota o un cambio del sistema no son
 * un contacto con el cliente.
 */
import { prisma } from "@/lib/db/prisma";
import type { ContactoDeCuenta } from "./quien-debe";

export async function cargarUltimosContactos(cuentaIds: readonly string[]): Promise<Record<string, ContactoDeCuenta>> {
  const ids = [...new Set(cuentaIds)];
  if (ids.length === 0) return {};
  const filas = await prisma.bitacoraCobro.findMany({
    where: { cuentaId: { in: ids }, tipo: { in: ["LLAMADA", "CORREO"] } },
    orderBy: { createdAt: "desc" },
    distinct: ["cuentaId"],
    select: { cuentaId: true, tipo: true, usuarioEmail: true, createdAt: true },
  });
  return Object.fromEntries(
    filas.map((f) => [f.cuentaId, { fecha: f.createdAt.toISOString().slice(0, 10), tipo: f.tipo, quien: f.usuarioEmail ?? "" }]),
  );
}
