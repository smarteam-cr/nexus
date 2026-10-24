/**
 * lib/sessions/canceladas.ts — QUÉ PASA CON UNA REUNIÓN CUYO EVENTO SE CANCELÓ (U1, 2026-10-25).
 *
 * La copia de Calendar (lib/google/meet-sync.ts) marca `FirefliesSession.canceladaEn` cuando ve el evento cancelado en
 * todos los calendarios donde estaba. Antes no lo veía: una reunión borrada se quedaba en la base como si fuera a pasar
 * (medido el 2026-10-24: 284 eventos cancelados en los últimos 30 días, 60 de ellos guardados, 5 con texto).
 *
 * ⚠ NUNCA SE BORRA. Borrar la fila arrastra en cascada los hechos, los turnos y la lectura. Y una cancelada puede
 * haber ocurrido: alguien movió el evento a otro después de la reunión, o lo borró al terminar (el kickoff técnico de
 * CAV, con transcripción, hechos y tareas, quedó cancelado así). Por eso dos casos:
 *   · con texto, minuta, hechos o tareas → queda en todas las lecturas, marcada, para que una persona la revise;
 *   · sin nada de eso → sale del chokepoint (`project-sources.ts`), del buscador («De tu calendario») y de la cola de
 *     lectura de Docs (`meet-enrichment.ts`): buscarle un Doc por el título trae el de otra reunión (KNOWN-ERRORS,
 *     primera entrada). La excepción es la que tiene su Doc ADJUNTO al evento y todavía sin leer: ese Doc es el de esa
 *     reunión, así que se lee, y si trae texto la reunión vuelve a todas las lecturas por la regla de arriba.
 * Si el evento vuelve, la copia la desmarca.
 *
 * «Texto» acá es transcripción, resumen o minuta (lo mismo que «hay algo que leer» del buscador), más los hechos y las
 * tareas que dejó su lectura.
 */
import { Prisma } from "@prisma/client";

/** Cancelada y sin nada: la que sale de las lecturas. */
const CANCELADA_SIN_TEXTO = {
  canceladaEn: { not: null },
  OR: [{ transcript: null }, { transcript: "" }],
  summary: { equals: Prisma.AnyNull },
  minute: { is: null },
  hechos: { none: {} },
  tareas: { none: {} },
} satisfies Prisma.FirefliesSessionWhereInput;

/**
 * Filtro de `FirefliesSession`: todo menos la cancelada sin texto. Se compone en el `where` de cada lectura (o de la
 * relación `session` de un vínculo).
 */
export const NO_ES_CANCELADA_SIN_TEXTO = { NOT: CANCELADA_SIN_TEXTO } satisfies Prisma.FirefliesSessionWhereInput;

/**
 * Filtro de la cola de Docs: una reunión se le busca o se le reintenta su texto si no está cancelada, o si lo está pero
 * tiene su Doc ADJUNTO (es el de esa reunión). Lo usan las pasadas y los reintentos de `meet-enrichment.ts`, el rescate
 * (`scripts/recuperar-transcripts-meet.ts`) e INV16(b): una sola regla para no dejar reuniones pendientes en una copia
 * y saltadas en otra.
 */
export const SE_LEE_SI_CANCELADA_TIENE_SU_DOC = {
  OR: [{ canceladaEn: null }, { googleDocId: { not: null } }],
} satisfies Prisma.FirefliesSessionWhereInput;

/** El mismo filtro, en SQL, para las consultas crudas. `s` = el alias de `FirefliesSession` en la consulta. */
export function noEsCanceladaSinTextoSql(alias: string = "s"): Prisma.Sql {
  const s = Prisma.raw(`"${alias.replace(/"/g, "")}"`);
  return Prisma.sql`NOT (
    ${s}."canceladaEn" IS NOT NULL
    AND coalesce(length(${s}."transcript"), 0) = 0
    AND (${s}."summary" IS NULL OR ${s}."summary" = 'null'::jsonb)
    AND NOT EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = ${s}."id")
    AND NOT EXISTS (SELECT 1 FROM "HechoDeReunion" h WHERE h."sessionId" = ${s}."id")
    AND NOT EXISTS (SELECT 1 FROM "Tarea" t WHERE t."sessionId" = ${s}."id")
  )`;
}
