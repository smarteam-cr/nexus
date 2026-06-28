/**
 * POST /api/business-cases/[id]/sessions
 *   body: { sessionId, included }
 *
 * Marca/desmarca una sesión de Fireflies como CONTEXTO del business case
 * (BusinessCaseSession, unique [businessCaseId, sessionId]). included=true la suma
 * a la generación; included=false la excluye. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true, clientId: true } });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  let body: { sessionId?: unknown; included?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const included = body.included !== false; // default true
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });

  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, resolvedClientId: true, manualClientId: true },
  });
  if (!session) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  // INVARIANTE #1 (no mezclar contexto entre clientes): NO atar al business case una sesión que
  // pertenece a OTRO cliente — su transcript alimentaría la generación del caso (leak cross-cliente).
  // Owner efectivo = manualClientId ?? resolvedClientId. Se permite: del mismo cliente o HUÉRFANA
  // (prospecto cuyas sesiones aún no resuelven). El override included=false (sacar) se deja pasar.
  const owner = session.manualClientId ?? session.resolvedClientId;
  if (included && owner && owner !== bc.clientId) {
    return NextResponse.json({ error: "La sesión pertenece a otro cliente." }, { status: 403 });
  }

  await prisma.businessCaseSession.upsert({
    where: { businessCaseId_sessionId: { businessCaseId: id, sessionId } },
    create: { businessCaseId: id, sessionId, included },
    update: { included },
  });

  return NextResponse.json({ ok: true, sessionId, included });
}
