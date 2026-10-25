import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { documentoConContexto } from "@/lib/contexto/documento";
import { EQUIPOS_DEL_CLIENTE } from "@/lib/exploraciones/equipos";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { guardarEquipoDeLaReunion } from "@/lib/sessions/equipo-de-la-reunion-server";

/**
 * PATCH /api/projects/[projectId]/contexto/[pieza]/equipo — EL EQUIPO DEL CLIENTE de una reunión del proyecto (L5 etapa 2
 * del roadmap, 2026-10-25). Solo el Contexto del DIAGNÓSTICO: es el documento que lee por equipo.
 *
 *   { sessionId, equipo: "marketing" | … | null } → guarda (o borra) con qué equipo del cliente fue esa reunión.
 *
 * La reunión tiene que ser de la membresía del proyecto (el chokepoint): una de otro proyecto o de otro cliente no se toca.
 * Guard: la misma celda que curar el Contexto del documento (generar el diagnóstico). No llama a la IA.
 */
const Cuerpo = z
  .object({
    sessionId: z.string().min(1).max(200),
    equipo: z.enum(EQUIPOS_DEL_CLIENTE).nullable(),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string; pieza: string }> }) {
  const { projectId, pieza } = await params;
  const doc = documentoConContexto(pieza);
  if (!doc || doc.pieza !== "diagnosis") {
    return NextResponse.json({ error: "Solo el diagnóstico lee las reuniones por equipo del cliente." }, { status: 404 });
  }
  const guard = await guardContextoDelDocumento(projectId, doc.seccion);
  if (guard instanceof NextResponse) return guard;

  const raw = await req.json().catch(() => null);
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return NextResponse.json({ error: "Falta la reunión o el equipo no es uno de los seis." }, { status: 400 });
  const { sessionId, equipo } = cuerpo.data;

  const miembros = await getProjectMemberSessions(projectId);
  if (!miembros.sessions.some((s) => s.id === sessionId)) {
    return NextResponse.json({ error: "Esa reunión no es de este proyecto." }, { status: 404 });
  }
  try {
    const ok = await guardarEquipoDeLaReunion(projectId, sessionId, equipo, guard.teamMember.email ?? null);
    if (!ok) return NextResponse.json({ error: "Esa reunión no está vinculada a este proyecto." }, { status: 404 });
  } catch (e) {
    console.warn("[contexto/equipo] no se guardó:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudo guardar el equipo: falta correr scripts/sql/2026-10-25-smartloop.sql en la base." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, equipo });
}
