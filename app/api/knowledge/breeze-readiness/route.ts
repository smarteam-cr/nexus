/**
 * GET /api/knowledge/breeze-readiness — ¿hay alcance de Breeze PUBLICADO?
 *
 * Lo consulta el workspace de Implementación para el aviso de arriba. "Cargado" =
 * al menos un KnowledgeDocument PUBLISHED con tag de Breeze. Los DRAFT no cuentan —
 * es la semántica del estado ("no visible para agentes"), y es lo que permite sembrar
 * un borrador sin que pase el gate: publicarlo es decisión del equipo, no del seed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withInternal } from "@/lib/api";
import { BREEZE_KNOWLEDGE_TAGS } from "@/components/landing/configs/implementacion.defs";

export const GET = withInternal(async () => {
  const count = await prisma.knowledgeDocument.count({
    where: {
      status: "PUBLISHED",
      tags: { some: { value: { in: [...BREEZE_KNOWLEDGE_TAGS] } } },
    },
  });
  return NextResponse.json({ ready: count > 0, count });
});
