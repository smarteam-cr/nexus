/**
 * lib/sessions/equipo-de-la-reunion-server.ts — EL EQUIPO DEL CLIENTE de una reunión del proyecto (L5 etapa 2 del roadmap,
 * 2026-10-25). SERVIDOR. El único escritor de `SessionProject.equipoDeLaReunion`.
 *
 * Las sesiones de una exploración llevan su equipo en la sesión (`SesionPlaneada.equipo`). Las demás reuniones del
 * proyecto —la entrega de servicio de Customer Success— lo llevan acá, en el vínculo reunión ↔ proyecto: así el documento
 * de diagnóstico lee cada reunión con su equipo (lib/canvas/diagnostico-por-equipo.ts).
 *
 * ⛔ No decide de quién es una reunión: lee y escribe SOLO el vínculo de ESTE proyecto con reuniones que ya salieron de
 * su membresía (el chokepoint, lib/sessions/project-sources.ts). Un vínculo que no existe no se crea: escribir sobre una
 * reunión que no es del proyecto no hace nada y devuelve false.
 *
 * Va por SQL (sin el cliente de Prisma) a propósito: si el SQL de la columna todavía no corrió
 * (scripts/sql/2026-10-25-smartloop.sql), leer devuelve «sin equipo» y el diagnóstico sale igual que antes.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esEquipo, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";

/** El equipo de cada una de estas reuniones en el proyecto (las que no tienen equipo no vienen). */
export async function equiposDeLasReuniones(projectId: string, sessionIds: readonly string[]): Promise<Map<string, ClaveDeEquipo>> {
  if (!sessionIds.length) return new Map();
  try {
    const filas = await prisma.$queryRaw<{ sessionId: string; equipo: string | null }[]>`
      SELECT sp."sessionId", sp."equipoDeLaReunion" AS "equipo"
      FROM "SessionProject" sp
      WHERE sp."projectId" = ${projectId} AND sp."sessionId" IN (${Prisma.join([...sessionIds])})`;
    return new Map(filas.flatMap((f) => (esEquipo(f.equipo) ? [[f.sessionId, f.equipo] as const] : [])));
  } catch (e) {
    console.warn("[equipo-de-la-reunion] no se pudo leer (¿falta el SQL 2026-10-25-smartloop?):", e instanceof Error ? e.message : e);
    return new Map();
  }
}

/**
 * Guarda (o borra, con null) el equipo de UNA reunión en el proyecto. false = la reunión no está vinculada al proyecto.
 *
 * Poner un equipo es una persona diciendo «esta reunión es de este proyecto»: si el vínculo todavía no tenía revisión
 * humana, queda revisado (`reviewedAt`, el candado contra el clasificador, lib/sessions/session-project-locks.ts). Sin eso,
 * una reclasificación podía borrar el vínculo —y el equipo— de una reunión que la IA había puesto (la revisión del 25 oct).
 */
export async function guardarEquipoDeLaReunion(
  projectId: string,
  sessionId: string,
  equipo: ClaveDeEquipo | null,
  porEmail: string | null,
): Promise<boolean> {
  const n = equipo
    ? await prisma.$executeRaw`
        UPDATE "SessionProject"
        SET "equipoDeLaReunion" = ${equipo},
            "reviewedAt" = COALESCE("reviewedAt", NOW()),
            "reviewedBy" = COALESCE("reviewedBy", ${porEmail})
        WHERE "projectId" = ${projectId} AND "sessionId" = ${sessionId}`
    : await prisma.$executeRaw`
        UPDATE "SessionProject" SET "equipoDeLaReunion" = NULL
        WHERE "projectId" = ${projectId} AND "sessionId" = ${sessionId}`;
  return n > 0;
}
