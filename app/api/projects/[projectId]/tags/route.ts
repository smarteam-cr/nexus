/**
 * GET/PUT /api/projects/[projectId]/tags
 *
 * Tags de PRODUCTO/ALCANCE del proyecto (slugs del catálogo `lib/tags/catalog.ts`).
 * La MODALIDAD (impl/re-impl) NO vive acá — es `Project.implementationType` (su propio
 * PATCH /implementation-type). GET auto-deriva un producto desde `serviceType` si está vacío.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectEditHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags, SERVICE_TO_PRODUCT } from "@/lib/tags/catalog";

// GET: tags del proyecto (auto-deriva un producto desde serviceType si está vacío). Lectura abierta.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tags: true, serviceType: true },
  });
  if (!project) return NextResponse.json({ tags: [] });

  // Normaliza lo guardado (puede tener labels legacy) a slugs canónicos.
  let tags = sanitizeTags(project.tags);

  // Vacío + hay serviceType → SUGERIR el producto por defecto (slug), SIN persistir:
  // un GET no debe mutar estado (semántica HTTP + RBAC: el lector puede no ser editor).
  // La materialización la hace el agente (persistTimelineFromAgentOutput) o el PUT del editor.
  if (tags.length === 0 && project.serviceType) {
    const product = SERVICE_TO_PRODUCT[project.serviceType];
    if (product) tags = [product];
  }

  return NextResponse.json({ tags });
}

// PUT: reemplaza los tags. EDICIÓN = editores del handoff (CSE ve, no edita — como impl-type).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectEditHandoff(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const tags = sanitizeTags((raw as { tags?: unknown })?.tags);

  await prisma.project.update({ where: { id: projectId }, data: { tags } });
  return NextResponse.json({ tags });
}
