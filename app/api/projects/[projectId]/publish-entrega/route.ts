/**
 * /api/projects/[projectId]/publish-entrega
 *
 * Compartir el canvas ENTREGA —el documento de cierre— con el cliente. Mismo token y misma
 * contraseña que las otras superficies; el `?next=entrega` decide dónde aterriza.
 *
 *   GET    → { published, publishedAt, clientUrl, hasAccess }
 *   POST   → compartir       (congela el snapshot + entregaPublishedAt = now)
 *   DELETE → dejar de compartir (entregaPublishedAt = null)
 *
 * ── POR QUÉ CONGELA, A DIFERENCIA DE DESARROLLO ──────────────────────────────
 * Un documento de entrega es un ACTO con fecha: «esto es lo que hicimos, te lo entregamos el
 * 13 de agosto». Si el contenido siguiera vivo, el PDF que el cliente guardó y el enlace que
 * abre dirían cosas distintas y no habría forma de saber cuál se le entregó. Y no es teórico:
 * el corrimiento del cierre cambia cada vez que alguien edita una duración del cronograma, así
 * que un cliente que reabre el enlace tres meses después vería un atraso distinto del que se
 * le explicó.
 *
 * El requerimiento técnico es el caso contrario —el dev quiere lo último— y por eso ese
 * endpoint no congela. Las dos decisiones son correctas y opuestas.
 *
 * ⚠ Se congela CRUDO; el filtro de secciones ocultas se aplica al LEER. Si filtráramos acá,
 * ocultar algo después de publicar no tendría efecto hasta re-publicar: el CSE tapa una
 * sección sensible y el cliente la sigue viendo.
 *
 * ⚠ Y se congela el ENCABEZADO, no solo el cuerpo. El título y el eyebrow salían de las defs
 * VIVAS (`LandingView` cae a `def.label` cuando no hay override), así que renombrar una
 * sección en el código le reescribía el encabezado a un documento ya entregado mientras el
 * texto de abajo seguía siendo el viejo: el cliente reabre su enlace y lee un título que ya
 * no describe lo que tiene debajo. Congelar el cuerpo y dejar vivo el título es congelar a
 * medias. Pasó al renombrar «Qué sigue» → «El siguiente proyecto» (2026-08-14).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPublicacionDeProyecto } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { publishSurface } from "@/lib/projects/publish-surfaces";
import { ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";

const SURFACE = publishSurface("entrega");

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      entregaPublishedAt: true,
      externalAccess: { select: { accessToken: true, revokedAt: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  const access = project.externalAccess;
  let clientUrl: string | null = null;
  if (access && !access.revokedAt) {
    const base = process.env.APP_URL || new URL(req.url).origin;
    clientUrl = `${base}/external/verify/${access.accessToken}?next=${SURFACE.next}`;
  }

  return NextResponse.json({
    published: !!project.entregaPublishedAt,
    publishedAt: project.entregaPublishedAt?.toISOString() ?? null,
    clientUrl,
    hasAccess: !!access && !access.revokedAt,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // Publicar exige, además del acceso, que el proyecto ADMITA publicación externa.
  const guard = await guardPublicacionDeProyecto(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvas = await prisma.projectCanvas.findFirst({
    where: canvasOfNested("delivery", { projectId }),
    select: {
      id: true,
      canvasSections: {
        orderBy: { order: "asc" },
        select: {
          key: true,
          titleOverride: true,
          eyebrowOverride: true,
          // Solo lo CONFIRMADO: un bloque en DRAFT es una propuesta que nadie aceptó.
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
    return NextResponse.json(
      { error: "SIN_CANVAS", message: "Este proyecto todavía no tiene el documento de Entrega." },
      { status: 409 },
    );
  }

  /* Nada que entregar ⇒ 409 con motivo, no una publicación vacía. Es el mismo criterio que el
     business case: publicar un documento en blanco es peor que no poder publicarlo, porque el
     cliente abre el enlace y no encuentra nada — y nadie se entera de este lado. */
  const conContenido = canvas.canvasSections.filter((s) => s.blocks.length > 0);
  if (conContenido.length === 0) {
    return NextResponse.json(
      {
        error: "SIN_CONTENIDO",
        message: "El documento de Entrega está vacío: generalo o escribilo antes de compartirlo.",
      },
      { status: 409 },
    );
  }

  /* El encabezado EFECTIVO —el que el cliente está viendo ahora mismo— se resuelve acá y se
     guarda como si fuera un override. `LandingView` ya prefiere el override sobre `def.label`,
     así que no hace falta tocar nada río abajo: el snapshot se vuelve autosuficiente. */
  const congeladas = canvas.canvasSections.map((s) => {
    const def = ENTREGA_DEF_BY_KEY[s.key];
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
      data: {
        publishedSnapshot: { sections: congeladas } as unknown as object,
        publishedSnapshotAt: now,
      },
    }),
    prisma.project.update({ where: { id: projectId }, data: { entregaPublishedAt: now } }),
  ]);

  return NextResponse.json({ published: true, publishedAt: now.toISOString() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  /* ⚠ `guardAccessToProject`, NO `guardPublicacionDeProyecto`: despublicar no se gatea nunca.
     Si un proyecto pasa a no-publicable DESPUÉS de haber compartido algo, gatear el DELETE
     dejaría contenido del cliente publicado y sin salida. Hay un candado que lo verifica. */
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  await prisma.project.update({
    where: { id: projectId },
    data: { entregaPublishedAt: null },
    select: { id: true },
  });
  return NextResponse.json({ published: false, publishedAt: null });
}
