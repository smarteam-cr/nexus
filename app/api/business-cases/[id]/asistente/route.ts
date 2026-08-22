/**
 * /api/business-cases/[id]/asistente — LA CONVERSACIÓN SOBRE UNA PROPUESTA COMERCIAL.
 *
 * Mismos verbos que la de proyectos: el cuerpo vive en `lib/asistente/handler.ts`. Lo único
 * propio es el dueño del hilo y el guard.
 *
 * ── POR QUÉ ESTA RUTA EXISTE, Y NO ALCANZABA CON LA DE PROYECTOS ─────────────
 * La propuesta comercial es el documento que originó todo el pedido —«los canvas de sitio web»
 * son un TIPO de propuesta, no un canvas de proyecto— y su canvas cuelga de un `BusinessCase`,
 * no de un proyecto. El hilo aprendió a colgar de otra cosa (ver `Dueno` en `lib/asistente/hilo`)
 * en vez de inventar una segunda tabla para exactamente lo mismo.
 *
 * RBAC: `guardSalesAccess` — el mismo que el resto de la propuesta. ⚠ NO se usa
 * `guardPermission("asistente","read")`: esa celda es de PROYECTO y Ventas no tiene permisos de
 * proyecto. Pedírsela dejaría el chat apagado justo para quien usa este documento todos los días.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { manejarGetDelAsistente, manejarPostDelAsistente } from "@/lib/asistente/handler";

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  return manejarGetDelAsistente(req, { businessCaseId: id });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  return manejarPostDelAsistente(req, { businessCaseId: id });
}
