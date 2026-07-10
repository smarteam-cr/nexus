/**
 * GET/PATCH /api/projects/[projectId]/horario-assignments
 *
 * Punta INTERNA (CSE) de la asignación franja→sesión del kickoff. La punta del cliente
 * es la server action `app/external/kickoff/actions.ts` — ambas escriben el mismo
 * overlay `Project.kickoffHorarioAssignments` por el mismo write path validado
 * (`assignKickoffHorario`), así que la coordinación es bidireccional y NO necesita
 * "Subir al cliente": el CSE ve al instante lo que arrastró el cliente y viceversa.
 *
 * GET   → { assignments } (null si el overlay aún no se sembró).
 * PATCH → body { sessionId: string, optionId: string | null }.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { assignKickoffHorario } from "@/lib/kickoff/assign-horario";
import { normalizeAssignments } from "@/lib/kickoff/horario-assignments";

const ERROR_MESSAGE = {
  no_section: "Este kickoff no tiene la sección de sesiones y horarios.",
  bad_session: "Esa sesión ya no existe.",
  bad_option: "Esa franja ya no existe.",
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { kickoffHorarioAssignments: true },
  });
  return NextResponse.json({ assignments: normalizeAssignments(project?.kickoffHorarioAssignments) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => null)) as { sessionId?: unknown; optionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  const optionId = typeof body?.optionId === "string" ? body.optionId : body?.optionId === null ? null : undefined;
  if (!sessionId || optionId === undefined) {
    return NextResponse.json({ error: "Faltan sessionId u optionId." }, { status: 400 });
  }

  const res = await assignKickoffHorario(projectId, sessionId, optionId);
  if (!res.ok) return NextResponse.json({ error: ERROR_MESSAGE[res.error] }, { status: 400 });
  return NextResponse.json({ assignments: res.assignments });
}
