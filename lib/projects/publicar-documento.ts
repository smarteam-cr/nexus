/**
 * lib/projects/publicar-documento.ts — compartir con el cliente el DIAGNÓSTICO o la PLANIFICACIÓN
 * (2026-10-02), con el mismo mecanismo de acceso que la Entrega (app/api/projects/[projectId]/publish-entrega).
 *
 * Los dos son entregables con fecha: el enlace muestra lo que se entregó, no lo último que alguien
 * editó. Pero cada uno congela distinto:
 *
 *  · DIAGNÓSTICO — tiene estados (borrador · presentado · aprobado) y al presentarlo se guarda una
 *    foto protegida. El enlace muestra ESA foto (decisión de Elías: «la versión presentada»), así que
 *    solo se puede compartir después de «Presentar». No hay snapshot propio: habría dos versiones
 *    «oficiales» que pueden no coincidir. Lo lee lib/external/diagnostico-view.ts.
 *  · PLANIFICACIÓN — no tiene estados: al compartir se congela un SNAPSHOT, crudo (lo oculto se filtra
 *    al leer) y con el ENCABEZADO resuelto (un rótulo que cambie en el código no le reescribe el
 *    título a un documento ya entregado). Solo bloques CONFIRMED.
 *
 * Las rutas (`publish-diagnostico`, `publish-planificacion`) llaman a sus guardas ANTES de esto:
 * publicar exige `guardPublicacionDeProyecto`; despublicar, solo acceso (nunca se gatea).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { publishSurface } from "@/lib/projects/publish-surfaces";
import { ultimaVersionPresentada } from "@/lib/external/diagnostico-view";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";

export type DocumentoPublicable = "diagnostico" | "planificacion";

export async function estadoDePublicacion(origen: string, projectId: string, doc: DocumentoPublicable) {
  const surface = publishSurface(doc);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      diagnosticoPublishedAt: true,
      planificacionPublishedAt: true,
      externalAccess: { select: { accessToken: true, revokedAt: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  const publicado = project[surface.flag as "diagnosticoPublishedAt" | "planificacionPublishedAt"];
  const access = project.externalAccess;
  const clientUrl =
    access && !access.revokedAt ? `${process.env.APP_URL || origen}/external/verify/${access.accessToken}?next=${surface.next}` : null;
  return NextResponse.json({
    published: !!publicado,
    publishedAt: publicado?.toISOString() ?? null,
    clientUrl,
    hasAccess: !!access && !access.revokedAt,
  });
}

export async function publicarDocumento(projectId: string, doc: DocumentoPublicable) {
  return doc === "diagnostico" ? publicarDiagnosticoPresentado(projectId) : publicarPlanificacion(projectId);
}

/** El diagnóstico se comparte en su versión PRESENTADA: sin presentar, no hay qué compartir. */
async function publicarDiagnosticoPresentado(projectId: string) {
  const canvas = await prisma.projectCanvas.findFirst({ where: canvasOfNested("diagnosis", { projectId }), select: { id: true } });
  if (!canvas) {
    return NextResponse.json({ error: "SIN_CANVAS", message: "Este proyecto todavía no tiene el Diagnóstico." }, { status: 409 });
  }
  if (!(await ultimaVersionPresentada(canvas.id))) {
    return NextResponse.json(
      {
        error: "SIN_PRESENTAR",
        message: "Primero presenta el Diagnóstico: el enlace le muestra al cliente la versión presentada.",
      },
      { status: 409 },
    );
  }
  const now = new Date();
  await prisma.project.update({ where: { id: projectId }, data: { diagnosticoPublishedAt: now } });
  return NextResponse.json({ published: true, publishedAt: now.toISOString() });
}

async function publicarPlanificacion(projectId: string) {
  const canvas = await prisma.projectCanvas.findFirst({
    where: canvasOfNested("planning", { projectId }),
    select: {
      id: true,
      canvasSections: {
        orderBy: { order: "asc" },
        select: {
          key: true,
          titleOverride: true,
          eyebrowOverride: true,
          blocks: {
            where: { status: "CONFIRMED" },
            orderBy: { order: "asc" },
            select: { blockType: true, content: true, data: true },
          },
        },
      },
    },
  });
  if (!canvas) {
    return NextResponse.json({ error: "SIN_CANVAS", message: "Este proyecto todavía no tiene la Planificación." }, { status: 409 });
  }
  if (!canvas.canvasSections.some((s) => s.blocks.length > 0)) {
    return NextResponse.json(
      { error: "SIN_CONTENIDO", message: "La Planificación está vacía: genérala o escríbela antes de compartirla." },
      { status: 409 },
    );
  }
  const congeladas = canvas.canvasSections.map((s) => {
    const def = PLANIFICACION_DEF_BY_KEY[s.key];
    return {
      ...s,
      titleOverride: (s.titleOverride ?? "").trim() || def?.label || null,
      eyebrowOverride: s.eyebrowOverride ?? def?.eyebrow ?? null,
    };
  });
  const now = new Date();
  await prisma.$transaction([
    prisma.projectCanvas.update({
      where: { id: canvas.id },
      data: { publishedSnapshot: { sections: congeladas } as unknown as object, publishedSnapshotAt: now },
    }),
    prisma.project.update({ where: { id: projectId }, data: { planificacionPublishedAt: now } }),
  ]);
  return NextResponse.json({ published: true, publishedAt: now.toISOString() });
}

export async function despublicarDocumento(projectId: string, doc: DocumentoPublicable) {
  const surface = publishSurface(doc);
  await prisma.project.update({ where: { id: projectId }, data: { [surface.flag]: null }, select: { id: true } });
  return NextResponse.json({ published: false, publishedAt: null });
}
