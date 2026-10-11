import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { conSugerenciaDescartada } from "@/lib/pieces/estado-de-cuestionarios";

/**
 * app/api/projects/[projectId]/cuestionarios-sugerencia — el «Ahora no» de «Manda los cuestionarios
 * al cliente» (2026-10-11).
 *
 * Los Cuestionarios son un artefacto RECOMENDADO: el «Qué sigue» del proyecto los sugiere con el kickoff
 * generado y ninguno publicado, hasta que se publica uno o alguien dice «Ahora no». Ese «Ahora no» se
 * guarda sin SQL, como entry reservada `__cuestionarios` del Json `ProjectCanvas.sections` del KICKOFF
 * (el mismo contrato que el `__doc` de las instrucciones: el doble guion bajo dice «no soy una sección»).
 * Se toca SOLO esa entry; `descartada: false` la saca y la sugerencia vuelve.
 *
 * Gate: el mismo que escribir los cuestionarios (`guardProjectHandoffAccess`).
 */

type Params = Promise<{ projectId: string }>;

const cuerpo = z.strictObject({ descartada: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  const kickoff = await prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf("kickoff") },
    select: { id: true, sections: true },
  });
  if (!kickoff) return NextResponse.json({ error: "Este proyecto no tiene kickoff." }, { status: 404 });

  const sections = conSugerenciaDescartada(
    kickoff.sections,
    parsed.data.descartada,
    guard.user.email ?? null,
    new Date().toISOString(),
  );
  await prisma.projectCanvas.update({ where: { id: kickoff.id }, data: { sections: sections as object[] } });

  return NextResponse.json({ descartada: parsed.data.descartada });
}
