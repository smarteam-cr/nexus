/**
 * POST /api/business-cases/[id]/sessions
 *   body: { sessionId, included }            — una reunión
 *   body: { sessionIds: string[], included } — varias de una vez («Quitar todas», «Vaciar y buscar»)
 *
 * Marca/desmarca sesiones de Fireflies como CONTEXTO del business case
 * (BusinessCaseSession, unique [businessCaseId, sessionId]). included=true la suma
 * a la generación; included=false la excluye. Gateado con guardSalesAccess.
 *
 * La forma de lista existe por el F-4 de Feedback (2026-10-08): en un cliente con historia, Ventas
 * sacaba 23 reuniones de a una para quedarse con la última. Va en UNA transacción: o quedan todas
 * como se pidió, o ninguna.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { belongsToClient, duenoDeLaSesion } from "@/lib/sessions/project-sources";

/** Tope de una lista: más que lo que trae el panel (las 200 más recientes de la empresa), sin abrir la puerta a cualquier cosa. */
const MAX_DE_UNA_VEZ = 400;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true, clientId: true } });
  if (!bc) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });

  let body: { sessionId?: unknown; sessionIds?: unknown; included?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const included = body.included !== false; // default true
  const enLista = Array.isArray(body.sessionIds);
  const ids = [
    ...new Set(
      (enLista ? (body.sessionIds as unknown[]) : [body.sessionId])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) {
    return enLista
      ? NextResponse.json({ ok: true, sessionIds: [], included })
      : NextResponse.json({ error: "sessionId requerido" }, { status: 400 });
  }
  if (ids.length > MAX_DE_UNA_VEZ) {
    return NextResponse.json({ error: `Son demasiadas de una vez (máximo ${MAX_DE_UNA_VEZ}).` }, { status: 400 });
  }

  const sesiones = await prisma.firefliesSession.findMany({
    where: { id: { in: ids } },
    select: { id: true, resolvedClientId: true, manualClientId: true },
  });
  if (sesiones.length !== ids.length) {
    return NextResponse.json({ error: ids.length === 1 ? "Sesión no encontrada" : "Alguna de esas sesiones no existe." }, { status: 404 });
  }
  // INVARIANTE #1 (no mezclar contexto entre clientes): solo se ata al business case una reunión de SU empresa, con la
  // misma regla con la que la propuesta las lee (`belongsToClient`, el lugar único; lib/business-cases/feeding.ts).
  // Desde el 2026-11-23 tampoco una SIN dueño: la propuesta ya no las lee, y atarla sería un «Agregar» que no agrega.
  // Se le asigna la empresa en Sesiones y entra sola. El override included=false (sacar) se deja pasar.
  if (included) {
    const ajenas = sesiones.filter((s) => !belongsToClient(s, bc.clientId));
    if (ajenas.length) {
      const sinEmpresa = ajenas.every((s) => !duenoDeLaSesion(s));
      const error = sinEmpresa
        ? ids.length === 1
          ? "Esa reunión todavía no tiene empresa. Asígnala en Sesiones y vuelve a agregarla."
          : "Alguna de esas reuniones todavía no tiene empresa. Asígnala en Sesiones y vuelve a agregarla."
        : ids.length === 1
          ? "La sesión pertenece a otro cliente."
          : "Alguna de esas sesiones pertenece a otro cliente.";
      return NextResponse.json({ error }, { status: 403 });
    }
  }

  await prisma.$transaction(
    ids.map((sessionId) =>
      prisma.businessCaseSession.upsert({
        where: { businessCaseId_sessionId: { businessCaseId: id, sessionId } },
        create: { businessCaseId: id, sessionId, included },
        update: { included },
      }),
    ),
  );

  return enLista
    ? NextResponse.json({ ok: true, sessionIds: ids, included })
    : NextResponse.json({ ok: true, sessionId: ids[0], included });
}
