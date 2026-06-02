import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { postProcessSession } from "@/lib/sessions/post-process";

/**
 * POST /api/sessions/[id]/post-process
 *
 * Trigger manual del agente Post-sesión.
 * Body opcional: { force?: boolean }  → si true, reemplaza la minuta existente.
 *
 * Devuelve PostProcessResult del helper.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  let force = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    force = !!body.force;
  } catch { /* body opcional */ }

  const result = await postProcessSession(id, { force });

  const httpStatus = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
