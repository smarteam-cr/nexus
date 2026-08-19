import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { guardAccessToClient } from "@/lib/auth/api-guards";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: {
      // Presencia de handoff: el picker del CTA solo ofrece proyectos sin handoff
      // (Handoff es 1:1 con Project).
      handoff: { select: { id: true } },
      _count: {
        select: {
          stageNotes: true,
          contextCards: true,
          documents: true,
          agentRuns: true,
        },
      },
    },
  });

  return NextResponse.json({ projects });
}

/* ⛔ ACÁ VIVÍA UN POST que creaba un proyecto suelto (retirado el 2026-08-19).
   Su único llamador era `ProjectsClient.tsx`, la pantalla del subsistema de etapas, que se
   borró. El alta de proyectos tiene un solo camino desde la Tanda C: `POST /api/projects`, que
   crea el registro en HubSpot Y en Nexus, con su permiso propio (`proyectos.create`) y su motor
   reintentable. Este creaba solo la fila de Nexus, sin nada de eso.

   ⚠ EL GET DE ARRIBA SIGUE VIVO: lo usan la pantalla de configuración del cliente y el menú
   «Enviar al canvas». Por eso se va el handler y no el archivo — que además `scope-coverage.ts`
   exige que exista. */
