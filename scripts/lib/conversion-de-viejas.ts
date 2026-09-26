/**
 * scripts/lib/conversion-de-viejas.ts — lo que `--convertir-viejas` y `--deshacer-conversion`
 * (scripts/propuestas-abiertas.ts, E4 P3) LEEN y ESCRIBEN en la base. La base llega por parámetro:
 * el script le pasa la suya y la prueba de integración la local (nunca producción).
 *
 * Toda escritura es un `updateMany` condicionado a lo que se leyó: el mismo cronograma, el mismo
 * token y la MISMA propuesta, entera. Si en el medio alguien la aplicó, la descartó o entró otra, la
 * fila no se toca (count 0) y se dice. La conversión conserva el token: la autoría sigue diciendo
 * «desde el handoff del …».
 *
 * Revisión de E4 (#3): el respaldo dice qué filas se escribieron DE VERDAD (`escrita`) y deshacer toca
 * solo esas. Una limpiada deja en el cronograma un `updatedAt` propio de la conversión (`limpiadaEn`), y
 * deshacerla lo exige: un cronograma vacío por otra razón (se aplicó o descartó otra propuesta después)
 * no recibe de vuelta la vieja.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { EntradaDeLaConversion, EventoDelCronograma, FilaDelRespaldo } from "./propuestas-abiertas";

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
 *  por decidir se limpia (propuesta y token) y deja en el cronograma `limpiadaEn` como `updatedAt`: la
 *  marca que exige deshacerla. */
export function escrituraDeLaConversion(e: EntradaDeLaConversion, limpiadaEn: Date): EscrituraDeUnaFila {
  return {
    where: { id: e.timelineId, pendingProposalRunId: e.token, pendingProposal: { equals: json(e.original) } },
    data:
      e.convertida === null
        ? { pendingProposal: Prisma.DbNull, pendingProposalRunId: null, updatedAt: limpiadaEn }
        : { pendingProposal: json(e.convertida) },
  };
}

/** Deshacer UNA fila: solo si sigue siendo lo que escribió la conversión (la convertida con su token,
 *  o vacía y con el `updatedAt` que le dejó la limpieza). Vuelve la vieja, con su token.
 *  ⛔ Solo para una fila `escrita`: `deshacerLaConversion` salta las demás. */
export function escrituraDeDeshacer(f: FilaDelRespaldo): EscrituraDeUnaFila {
  return f.convertida === null
    ? {
        where: {
          id: f.timelineId,
          pendingProposalRunId: null,
          pendingProposal: { equals: Prisma.DbNull },
          // Sin la marca no se sabe si sigue como la dejó la conversión: 1970 no encaja con ninguna fila.
          updatedAt: new Date(f.limpiadaEn ?? 0),
        },
        data: { pendingProposal: json(f.original), pendingProposalRunId: f.token },
      }
    : {
        where: { id: f.timelineId, pendingProposalRunId: f.token, pendingProposal: { equals: json(f.convertida) } },
        data: { pendingProposal: json(f.original) },
      };
}

/** Cómo terminó cada fila: escrita, no se tocó porque cambió desde que se leyó, o (deshacer) se saltó
 *  porque la conversión no la había escrito. */
export interface ResultadoDeLaEscritura<F extends EntradaDeLaConversion = EntradaDeLaConversion> {
  escritas: F[];
  cambiaron: F[];
  /** Solo deshacer: las que la conversión no escribió (count 0 al convertir). No se tocan. */
  noEscritas: F[];
}

/**
 * Escribe la conversión y devuelve las filas del respaldo, con `escrita` y `limpiadaEn`.
 * ⛔ `guardarRespaldo` corre ANTES de la primera escritura, con todas las filas en `escrita: false`: si
 * falla (tira), no se escribe nada. Después de cada fila se vuelve a guardar con lo que pasó, así el
 * archivo dice siempre qué se escribió (un corte a mitad deja marcadas como escritas solo las que lo
 * fueron). Sin filas, no respalda ni escribe. `ahora` es la marca de las limpiadas.
 */
export async function escribirLaConversion(
  db: Db,
  entradas: readonly EntradaDeLaConversion[],
  guardarRespaldo: (filas: readonly FilaDelRespaldo[]) => void,
  ahora: Date = new Date(),
): Promise<ResultadoDeLaEscritura & { filas: FilaDelRespaldo[] }> {
  const r: ResultadoDeLaEscritura & { filas: FilaDelRespaldo[] } = { escritas: [], cambiaron: [], noEscritas: [], filas: [] };
  if (entradas.length === 0) return r;
  r.filas = entradas.map((e) => ({ ...e, escrita: false, limpiadaEn: null }));
  guardarRespaldo(r.filas);
  for (const [k, e] of entradas.entries()) {
    const { count } = await db.projectTimeline.updateMany(escrituraDeLaConversion(e, ahora));
    if (count === 1) {
      r.filas[k] = { ...r.filas[k], escrita: true, limpiadaEn: e.convertida === null ? ahora.toISOString() : null };
      guardarRespaldo(r.filas);
    }
    (count === 1 ? r.escritas : r.cambiaron).push(e);
  }
  return r;
}

/** Deshace la conversión fila por fila (el respaldo es el archivo que se le pasa). Solo las `escrita`. */
export async function deshacerLaConversion(
  db: Db,
  filas: readonly FilaDelRespaldo[],
): Promise<ResultadoDeLaEscritura<FilaDelRespaldo>> {
  const r: ResultadoDeLaEscritura<FilaDelRespaldo> = { escritas: [], cambiaron: [], noEscritas: [] };
  for (const f of filas) {
    if (!f.escrita) {
      r.noEscritas.push(f);
      continue;
    }
    const { count } = await db.projectTimeline.updateMany(escrituraDeDeshacer(f));
    (count === 1 ? r.escritas : r.cambiaron).push(f);
  }
  return r;
}
