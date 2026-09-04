/**
 * lib/business-cases/aprobacion.ts — LA PROPUESTA SE APRUEBA UNA SOLA VEZ, Y LA BASE LO GARANTIZA.
 *
 * A-21 (auditoría 2026-09-03): `approveBusinessCase` prometía en su docblock «si ya estaba aprobada
 * devuelve la aprobación EXISTENTE sin pisarla», y lo hacía con un check-then-act: leer, mirar
 * `approvedAt`, y recién después escribir. Dos aprobaciones concurrentes —dos personas del cliente
 * con el mismo enlace, o un doble click— leían las dos «sin aprobar» y escribían las dos: quedaba
 * registrado el ÚLTIMO, que es exactamente lo que el docblock decía impedir. Quién aprobó primero
 * es el dato que le importa a Ventas.
 *
 * Ahora la condición viaja en el `where` de la escritura (`approvedAt: null`): Postgres decide
 * quién gana, y el que pierde lee la aprobación que ganó. El acceso a la base entra por una
 * interfaz mínima para probarlo sin Prisma; la base falsa del test honra el `where` como Postgres.
 */

export interface DatosDeAprobacion {
  approvedAt: Date;
  approvedByEmail: string;
  approvedByName: string | null;
  approvedSnapshotAt: Date | null;
}

export interface Aprobacion {
  approvedAt: Date;
  approvedByEmail: string | null;
  approvedByName: string | null;
  approvedSnapshotAt: Date | null;
}

export interface FilaAprobable {
  publishedAt: Date | null;
  approvedAt: Date | null;
  approvedByEmail: string | null;
  approvedByName: string | null;
  approvedSnapshotAt: Date | null;
}

const SELECT = {
  publishedAt: true,
  approvedAt: true,
  approvedByEmail: true,
  approvedByName: true,
  approvedSnapshotAt: true,
} as const;

/** Lo mínimo que la aprobación necesita de la base. `prisma` cumple; una base falsa también. */
export interface BaseDeAprobacion {
  businessCase: {
    findUnique(args: { where: { id: string }; select: typeof SELECT }): PromiseLike<FilaAprobable | null>;
    /** ⚠ `approvedAt: null` en el WHERE es la garantía entera: sin eso no hay atomicidad. */
    updateMany(args: {
      where: { id: string; approvedAt: null };
      data: DatosDeAprobacion;
    }): PromiseLike<{ count: number }>;
  };
}

export async function aprobarUnaSolaVez(
  db: BaseDeAprobacion,
  businessCaseId: string,
  input: { email: string; name?: string | null },
  ahora: Date = new Date(),
): Promise<{ approval: Aprobacion; yaEstaba: boolean }> {
  const antes = await db.businessCase.findUnique({ where: { id: businessCaseId }, select: SELECT });
  if (!antes) throw new Error("business case inexistente");

  const data: DatosDeAprobacion = {
    approvedAt: ahora,
    approvedByEmail: input.email,
    approvedByName: input.name?.trim() || null,
    approvedSnapshotAt: antes.publishedAt,
  };

  // Atómico: solo escribe si NADIE aprobó entre la lectura de arriba y esta línea.
  const { count } = await db.businessCase.updateMany({
    where: { id: businessCaseId, approvedAt: null },
    data,
  });
  if (count === 1) return { yaEstaba: false, approval: data };

  // Perdimos la carrera (o ya estaba): la aprobación que vale es la que quedó en la base.
  const despues = await db.businessCase.findUnique({ where: { id: businessCaseId }, select: SELECT });
  if (!despues?.approvedAt) throw new Error("business case inexistente");
  return {
    yaEstaba: true,
    approval: {
      approvedAt: despues.approvedAt,
      approvedByEmail: despues.approvedByEmail,
      approvedByName: despues.approvedByName,
      approvedSnapshotAt: despues.approvedSnapshotAt,
    },
  };
}
