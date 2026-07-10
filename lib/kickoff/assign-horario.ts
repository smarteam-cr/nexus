import "server-only";

/**
 * lib/kickoff/assign-horario.ts
 *
 * ÚNICO write path de la asignación franja→sesión del kickoff. Lo comparten las dos
 * puntas que escriben el overlay `Project.kickoffHorarioAssignments`:
 *   · el CLIENTE, desde su página (server action de app/external/kickoff/), y
 *   · el CSE, desde Nexus (PATCH /api/projects/[projectId]/horario-assignments).
 *
 * Ninguna de las dos confía en el body: `sessionId` y `optionId` tienen que existir en
 * la data de horarios DE ESE proyecto. Quién puede llamar (token válido / sesión de
 * Nexus con acceso al proyecto) lo resuelve cada caller ANTES de entrar acá.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  assign,
  idsOf,
  normalizeAssignments,
  seedAssignments,
  HORARIOS_KEY,
  type HorarioAssignments,
} from "./horario-assignments";

export type AssignResult =
  | { ok: true; assignments: HorarioAssignments }
  | { ok: false; error: "no_section" | "bad_session" | "bad_option" };

/**
 * Asigna (o desasigna, con `optionId === null`) una franja a una sesión.
 *
 * La DEFINICIÓN de franjas/sesiones se lee del bloque CARD VIVO de la sección
 * `horarios` — no del snapshot: si el CSE agregó una franja y todavía no publicó, el
 * cliente tampoco la ve (su página lee el snapshot), así que nunca puede mandar un id
 * que no esté también en el vivo. Al revés (franja borrada tras publicar) el id ya no
 * valida y la escritura se rechaza, que es lo correcto.
 *
 * La franja es EXCLUSIVA: al asignarla se limpia de cualquier otra sesión.
 */
export async function assignKickoffHorario(
  projectId: string,
  sessionId: string,
  optionId: string | null,
): Promise<AssignResult> {
  const section = await prisma.canvasSection.findFirst({
    where: { key: HORARIOS_KEY, canvas: { projectId, name: "Kickoff" } },
    select: { blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, take: 1, select: { data: true } } },
  });
  const data = section?.blocks[0]?.data;
  if (!data) return { ok: false, error: "no_section" };

  const { sessionIds, optionIds } = idsOf(data);
  if (!sessionIds.has(sessionId)) return { ok: false, error: "bad_session" };
  if (optionId !== null && !optionIds.has(optionId)) return { ok: false, error: "bad_option" };

  /**
   * SERIALIZADO por fila. El overlay es un JSON que se reescribe ENTERO (la franja es
   * exclusiva: asignarla la quita de las demás sesiones), y lo escriben DOS puntas a la vez
   * — el CSE desde Nexus y el cliente desde su página. Un read-modify-write sin bloqueo
   * pierde la escritura más lenta EN SILENCIO: el cliente ve su franja elegida pero la DB
   * guarda la del CSE. `FOR UPDATE` bloquea la fila del proyecto hasta el commit, así que la
   * segunda transacción lee el overlay YA actualizado por la primera.
   */
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ kickoffHorarioAssignments: unknown }>>`
      SELECT "kickoffHorarioAssignments" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE
    `;
    if (!rows.length) return { ok: false, error: "no_section" } as const;

    // Sin overlay todavía → sembrarlo desde los `sessions[].optionId` del bloque, así la
    // primera escritura no borra las asignaciones que el CSE ya había hecho a mano.
    const current = normalizeAssignments(rows[0].kickoffHorarioAssignments) ?? seedAssignments(data);
    const next = assign(current, sessionId, optionId);

    await tx.project.update({
      where: { id: projectId },
      data: { kickoffHorarioAssignments: next as Prisma.InputJsonValue },
    });
    return { ok: true, assignments: next } as const;
  });
}
