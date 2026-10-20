/**
 * /api/projects/[projectId]/kickoff-visibility
 *
 * #3 — visibilidad por sección/proceso del kickoff del cliente, gestionada DESDE el
 * canvas del kickoff (no desde el modal de acceso). Una clave puede ser el id de una
 * CanvasSection, "procesos", "cronograma", o el id de un proceso (flowchart) individual.
 *
 * DOS sets (2026-10-20, lib/kickoff/ocultas-del-editor.ts):
 *   · `Project.hiddenKickoffKeys` — lo que el CLIENTE no ve. Solo cambia al «Subir».
 *   · la entry `__ocultas` del Json del canvas del kickoff — lo que el CSE tiene oculto en el
 *     editor. Se guarda en cada clic del ojo: antes vivía en el navegador y una sección oculta sin
 *     subir volvía a aparecer al recargar.
 *
 *   GET   → { hiddenKeys, borrador }   (borrador null = el editor está igual que lo publicado)
 *   PATCH { borrador: string[] }       → guarda el set del editor (el cliente no ve nada todavía)
 *   PATCH { hiddenKeys: string[] }     → «Subir»: reemplaza lo publicado y borra el borrador
 *
 * Guarded. El gate de la vista del cliente vive en lib/external/kickoff-view.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { conOcultasDelBorrador, mismasOcultas, ocultasDelBorrador } from "@/lib/kickoff/ocultas-del-editor";

type Params = Promise<{ projectId: string }>;

const claves = z.array(z.string().min(1).max(200)).max(500);
const cuerpo = z.union([z.strictObject({ hiddenKeys: claves }), z.strictObject({ borrador: claves })]);

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const [project, canvas] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { hiddenKickoffKeys: true } }),
    prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") }, select: { sections: true } }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  return NextResponse.json({ hiddenKeys: project.hiddenKickoffKeys, borrador: ocultasDelBorrador(canvas?.sections) });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  const [project, canvas] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { hiddenKickoffKeys: true } }),
    prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") }, select: { id: true, sections: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  const ahora = new Date().toISOString();
  const por = guard.user.email ?? null;

  if ("borrador" in parsed.data) {
    if (!canvas) return NextResponse.json({ error: "Este proyecto no tiene kickoff." }, { status: 404 });
    // Igual que lo publicado = no hay borrador: la barra de «sin subir» no se prende por nada.
    const borrador = mismasOcultas(parsed.data.borrador, project.hiddenKickoffKeys) ? null : parsed.data.borrador;
    await prisma.projectCanvas.update({
      where: { id: canvas.id },
      data: { sections: conOcultasDelBorrador(canvas.sections, borrador, por, ahora) as object[] },
    });
    return NextResponse.json({ hiddenKeys: project.hiddenKickoffKeys, borrador });
  }

  // «Subir»: el set completo pasa al cliente y el canvas vuelve a coincidir con lo publicado.
  const hiddenKeys = [...new Set(parsed.data.hiddenKeys)];
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { hiddenKickoffKeys: hiddenKeys },
    select: { hiddenKickoffKeys: true },
  });
  if (canvas && ocultasDelBorrador(canvas.sections) !== null) {
    await prisma.projectCanvas.update({
      where: { id: canvas.id },
      data: { sections: conOcultasDelBorrador(canvas.sections, null, por, ahora) as object[] },
    });
  }
  return NextResponse.json({ hiddenKeys: updated.hiddenKickoffKeys, borrador: null });
}
