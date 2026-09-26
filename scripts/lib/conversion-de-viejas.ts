/**
 * scripts/lib/conversion-de-viejas.ts — lo que `--convertir-viejas` y `--deshacer-conversion`
 * (scripts/propuestas-abiertas.ts, E4 P3) LEEN y ESCRIBEN en la base. La base llega por parámetro:
 * el script le pasa la suya y la prueba de integración la local (nunca producción).
 *
 * Toda escritura es un `updateMany` condicionado a lo que se leyó: el mismo cronograma, el mismo
 * token y la MISMA propuesta, entera. Si en el medio alguien la aplicó, la descartó o entró otra, la
 * fila no se toca (count 0) y se dice. La conversión conserva el token: la autoría sigue diciendo
 * «desde el handoff del …».
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { EntradaDeLaConversion, EventoDelCronograma } from "./propuestas-abiertas";

type Db = Pick<PrismaClient, "projectTimeline" | "timelineEvent">;

/**
 * Las ediciones del cronograma posteriores a `creada` que sirven para desandarlo (`fotoAlCrearse`):
 * los cambios de campos y de orden de las fases, las fases creadas y los cambios de arranque.
 */
export async function eventosPosteriores(db: Db, projectId: string, creada: Date): Promise<EventoDelCronograma[]> {
  return db.timelineEvent.findMany({
    where: {
      projectId,
      createdAt: { gt: creada },
      entityType: { in: ["PHASE", "TIMELINE"] },
      action: { in: ["EDITED", "MOVED", "CREATED", "ANCHOR_CHANGED"] },
    },
    select: { entityType: true, entityId: true, action: true, before: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** El `where` y el `data` del `updateMany` de UNA fila. */
export interface EscrituraDeUnaFila {
  where: Prisma.ProjectTimelineWhereInput;
  data: Prisma.ProjectTimelineUpdateManyMutationInput;
}

/** Convertir UNA fila: solo si sigue siendo la vieja que se leyó, con su token. Una que no dejaba nada
 *  por decidir se limpia (propuesta y token). */
export function escrituraDeLaConversion(e: EntradaDeLaConversion): EscrituraDeUnaFila {
  return {
    where: { id: e.timelineId, pendingProposalRunId: e.token, pendingProposal: { equals: json(e.original) } },
    data:
      e.convertida === null
        ? { pendingProposal: Prisma.DbNull, pendingProposalRunId: null }
        : { pendingProposal: json(e.convertida) },
  };
}

/** Deshacer UNA fila: solo si sigue siendo lo que escribió la conversión (la convertida con su token,
 *  o vacía si se limpió). Vuelve la vieja, con su token. */
export function escrituraDeDeshacer(e: EntradaDeLaConversion): EscrituraDeUnaFila {
  return e.convertida === null
    ? {
        where: { id: e.timelineId, pendingProposalRunId: null, pendingProposal: { equals: Prisma.DbNull } },
        data: { pendingProposal: json(e.original), pendingProposalRunId: e.token },
      }
    : {
        where: { id: e.timelineId, pendingProposalRunId: e.token, pendingProposal: { equals: json(e.convertida) } },
        data: { pendingProposal: json(e.original) },
      };
}

/** Cómo terminó cada fila: escrita, o no se tocó porque cambió desde que se leyó. */
export interface ResultadoDeLaEscritura {
  escritas: EntradaDeLaConversion[];
  cambiaron: EntradaDeLaConversion[];
}

/**
 * Escribe la conversión. ⛔ `guardarRespaldo` corre ANTES de la primera escritura, con todas las
 * filas: si falla (tira), no se escribe nada. Sin filas, no respalda ni escribe.
 */
export async function escribirLaConversion(
  db: Db,
  entradas: readonly EntradaDeLaConversion[],
  guardarRespaldo: (entradas: readonly EntradaDeLaConversion[]) => void,
): Promise<ResultadoDeLaEscritura> {
  const r: ResultadoDeLaEscritura = { escritas: [], cambiaron: [] };
  if (entradas.length === 0) return r;
  guardarRespaldo(entradas);
  for (const e of entradas) {
    const { count } = await db.projectTimeline.updateMany(escrituraDeLaConversion(e));
    (count === 1 ? r.escritas : r.cambiaron).push(e);
  }
  return r;
}

/** Deshace la conversión fila por fila (el respaldo es el archivo que se le pasa). */
export async function deshacerLaConversion(db: Db, entradas: readonly EntradaDeLaConversion[]): Promise<ResultadoDeLaEscritura> {
  const r: ResultadoDeLaEscritura = { escritas: [], cambiaron: [] };
  for (const e of entradas) {
    const { count } = await db.projectTimeline.updateMany(escrituraDeDeshacer(e));
    (count === 1 ? r.escritas : r.cambiaron).push(e);
  }
  return r;
}
