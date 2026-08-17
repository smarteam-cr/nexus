/**
 * POST /api/projects/[projectId]/brief — generar (o regenerar) el resumen citado del proyecto.
 *
 * ── ON-DEMAND A PROPÓSITO ────────────────────────────────────────────────────
 * Nada de regeneración masiva: lo dispara una persona desde la pantalla del proyecto. El aviso de
 * «quedó viejo» lo calcula `lib/projects/brief-vencido.ts` al leer, y la decisión de regenerar es
 * de quien mira — no de un cron que quema tokens sobre 163 proyectos por las dudas.
 *
 * ── EL GATE ES EL ACCESO AL PROYECTO, NO UNA CELDA NUEVA ─────────────────────
 * Leer cómo va un proyecto al que ya tenés acceso no es un privilegio aparte: quien puede abrir
 * el proyecto ya ve sus reuniones, su cronograma y su estado. Inventar una celda propia acá
 * habría creado una regla más estricta para el RESUMEN que para todo lo que resume.
 *
 * ── CONCURRENCIA ─────────────────────────────────────────────────────────────
 * Mutex en proceso (doble click = 409) + chequeo en DB de una corrida RUNNING reciente, que cubre
 * la otra máquina del setup de dos PCs. Peor caso residual: el costo duplicado de UNA llamada; el
 * upsert es consistente igual.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { runProjectBrief } from "@/lib/projects/project-brief";

const enCurso = new Set<string>();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  if (enCurso.has(projectId)) {
    return NextResponse.json(
      { error: "Ya hay un resumen generándose para este proyecto." },
      { status: 409 },
    );
  }
  const corriendo = await prisma.agentRun.findFirst({
    where: {
      agentSlug: "project-brief",
      projectId,
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (corriendo) {
    return NextResponse.json(
      { error: "Ya hay un resumen generándose para este proyecto." },
      { status: 409 },
    );
  }

  enCurso.add(projectId);
  try {
    const r = await runProjectBrief(projectId, { triggeredByEmail: await triggeredByEmail() });

    if (r.status === "skipped") {
      /* Cada motivo dice qué hacer. «El agente no está» es de configuración y no es culpa de
         quien apretó; «sin material» es el hueco real y la salida es cargar contexto, no
         reintentar. Un mensaje único mandaría a las dos personas al lugar equivocado. */
      const mensajes: Record<typeof r.reason, string> = {
        agent_not_seeded:
          "El agente de resumen todavía no está creado en esta instalación " +
          "(correr scripts/create-project-brief-agent.ts).",
        no_project: "Ese proyecto ya no existe.",
        sin_material:
          "Este proyecto todavía no tiene de dónde sacar un resumen: no hay reuniones con " +
          "transcripción, ni estado cargado en HubSpot, ni desviaciones registradas.",
      };
      return NextResponse.json({ error: mensajes[r.reason] }, { status: 409 });
    }
    if (r.status === "error") {
      return NextResponse.json({ error: r.error, runId: r.runId }, { status: 502 });
    }
    /* `discarded` viaja a la pantalla a propósito: es cuántas afirmaciones se tiraron por citar
       una fuente inexistente, y un número alto es la señal de que el prompt está flojo. Esconderlo
       dejaría el único indicador de calidad que este circuito produce. */
    return NextResponse.json({
      ok: true,
      runId: r.runId,
      statements: r.statements,
      discarded: r.discarded,
    });
  } finally {
    enCurso.delete(projectId);
  }
}
