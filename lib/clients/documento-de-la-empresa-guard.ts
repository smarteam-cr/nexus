/**
 * lib/clients/documento-de-la-empresa-guard.ts — la puerta de las rutas de un documento de la EMPRESA (R3 etapa 3,
 * 2026-10-27). SERVIDOR.
 *
 * Un documento de la empresa no tiene proyecto: las rutas de `/api/projects/[projectId]/…` no lo pueden abrir (exigen que
 * el documento sea de ese proyecto). Sus rutas viven en `/api/clients/[id]/documentos/[canvasId]/…` y TODAS pasan por acá:
 *   1. ids con forma de id (letras, números, guiones: los del mundo `fx-` de la base local también);
 *   2. acceso a la empresa (`guardAccessToClient`: el mismo row-level que la ficha);
 *   3. el documento es de ESA empresa y de nadie más (`clientId` = la empresa, sin proyecto ni propuesta).
 * Una sección, además, tiene que ser de ese documento. Fail-closed: cualquier duda es 404.
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

const Id = z.string().min(1).max(64).regex(/^[\w-]+$/);

export interface DocumentoGuardado {
  canvasId: string;
  clientId: string;
  nombre: string;
  slug: string | null;
  sections: unknown;
  email: string;
}

export async function guardDocumentoDeLaEmpresa(clientId: string, canvasId: string): Promise<DocumentoGuardado | NextResponse> {
  if (!Id.safeParse(clientId).success || !Id.safeParse(canvasId).success) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;
  const canvas = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, clientId, projectId: null, businessCaseId: null },
    select: { id: true, name: true, slug: true, sections: true },
  });
  if (!canvas) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  return { canvasId: canvas.id, clientId, nombre: canvas.name, slug: canvas.slug, sections: canvas.sections, email: guard.user.email };
}

/** La sección, si es de ese documento. */
export async function seccionDelDocumento(canvasId: string, sectionId: string) {
  if (!Id.safeParse(sectionId).success) return null;
  return prisma.canvasSection.findFirst({
    where: { id: sectionId, canvasId },
    select: { id: true, key: true, titleOverride: true, eyebrowOverride: true, previousTitleOverride: true, previousEyebrowOverride: true },
  });
}
