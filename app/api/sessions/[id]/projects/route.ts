import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { belongsToClient } from "@/lib/sessions/project-sources";

/**
 * GET /api/sessions/[id]/projects
 *
 * Lista los proyectos asignados a una sesión (vía SessionProject).
 * Incluye name + isPrimary + source + confidence.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userGuard = await guardInternalUser();
  if (userGuard instanceof NextResponse) return userGuard;

  const { id } = await params;
  const assignments = await prisma.sessionProject.findMany({
    where: { sessionId: id },
    orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
    select: {
      id: true,
      projectId: true,
      isPrimary: true,
      source: true,
      confidence: true,
      rationale: true,
      project: {
        select: {
          id: true,
          name: true,
          serviceType: true,
          clientId: true,
        },
      },
    },
  });

  return NextResponse.json({ assignments });
}

/**
 * POST /api/sessions/[id]/projects
 *
 * Asigna un proyecto a la sesión manualmente (source="manual"). Si se pasa
 * makePrimary=true, el nuevo asignado pasa a ser el primario y los demás
 * se demoten.
 *
 * Body: { projectId, makePrimary?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  let body: { projectId?: string; makePrimary?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  }

  const guard = await guardAccessToProject(body.projectId);
  if (guard instanceof NextResponse) return guard;

  // Hardening INV1 (escritura): la sesión debe pertenecer al cliente del proyecto
  // (misma regla que el chokepoint de lectura). Se permite si la sesión aún no está
  // resuelta (resolvedClientId null y sin override) — mismo criterio que el invariante.
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { resolvedClientId: true, manualClientId: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Sesión no existe" }, { status: 404 });
  }
  if (session.resolvedClientId !== null && !belongsToClient(session, guard.clientId)) {
    return NextResponse.json(
      { error: "La sesión pertenece a otro cliente — no se puede vincular a este proyecto." },
      { status: 400 },
    );
  }

  const makePrimary = body.makePrimary === true;

  // Si va a ser primario, demoter al actual primario
  if (makePrimary) {
    await prisma.sessionProject.updateMany({
      where: { sessionId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const created = await prisma.sessionProject.upsert({
    where: {
      sessionId_projectId: { sessionId, projectId: body.projectId },
    },
    create: {
      sessionId,
      projectId: body.projectId,
      isPrimary: makePrimary,
      source: "manual",
    },
    update: {
      source: "manual",
      // Asignación manual explícita resucita un tombstone (included=false): el humano
      // que hoy la vincula pisa la exclusión de ayer.
      included: true,
      isPrimary: makePrimary ? true : undefined,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
