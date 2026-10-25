/**
 * GET /api/projects/[projectId]/session-candidates/en-otra-empresa?q= — las reuniones que quedaron en OTRA empresa con
 * gente de un dominio de la empresa de este proyecto (T8, 2026-10-25). Alimenta «En otra empresa» del buscador de
 * «Contexto adicional», con «Mover a esta empresa» (POST /api/sessions/[id]/empresa, `accion: "mover"`).
 *
 * Pide acceso al proyecto. Las de una empresa que quien busca no tiene asignada no se muestran: se cuentan. Solo
 * lectura. Lo demás: lib/sessions/buscar-en-la-empresa-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { reunionesEnOtraEmpresa } from "@/lib/sessions/buscar-en-la-empresa-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const teamMemberId = guard.user.teamMember?.id;
  if (!teamMemberId) return NextResponse.json({ clientId: guard.clientId, reuniones: [], ocultas: 0, dominios: [] });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const r = await reunionesEnOtraEmpresa({ clientId: guard.clientId, teamMemberId, q: q || null });
  return NextResponse.json({ clientId: guard.clientId, ...r });
}
