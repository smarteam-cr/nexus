/**
 * lib/clients/soltar-reuniones.ts — antes de borrar una empresa, sus reuniones quedan sin dueña (R7, 2026-10-24).
 *
 * Desde R7 `FirefliesSession.resolvedClientId` es una llave con RESTRICT: la base no deja borrar una empresa que todavía
 * es dueña de reuniones. Todo lo que borra una empresa (el DELETE de la app y los scripts) suelta antes sus reuniones con
 * esta función, DENTRO de la misma transacción del borrado: dejarlas sin dueña es el estado honesto, y el re-resolver
 * les vuelve a encontrar dueña por dominio a las que lo tengan. Un script que limpia duplicados usa
 * `reunionesDeLaEmpresa` para NO borrar una empresa real con reuniones. Decisión: DECISIONS › «Las llaves de la empresa».
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient | Prisma.TransactionClient, "firefliesSession">;

/** Suelta las reuniones de la empresa (dueña resuelta y asignación manual). Devuelve cuántas soltó de cada una. */
export async function soltarReunionesDeLaEmpresa(db: Db, clientId: string): Promise<{ manuales: number; resueltas: number }> {
  const manuales = await db.firefliesSession.updateMany({ where: { manualClientId: clientId }, data: { manualClientId: null } });
  const resueltas = await db.firefliesSession.updateMany({ where: { resolvedClientId: clientId }, data: { resolvedClientId: null } });
  return { manuales: manuales.count, resueltas: resueltas.count };
}

/** Cuántas reuniones tiene la empresa, como dueña o por asignación manual. */
export async function reunionesDeLaEmpresa(db: Db, clientId: string): Promise<number> {
  return db.firefliesSession.count({ where: { OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }] } });
}
