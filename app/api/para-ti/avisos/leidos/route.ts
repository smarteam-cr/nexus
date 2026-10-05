/**
 * POST /api/para-ti/avisos/leidos — marca leídos avisos de la persona logueada (2026-10-04).
 *
 * Body: `{ ids: string[] }` o `{ todos: true }`. Solo toca los avisos de quien lo pide: el filtro por destinatario va
 * en la consulta (`marcarLeidos`), no en el cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { marcarLeidos } from "@/lib/para-ti/avisos-server";
import { marcarLeidosSchema } from "@/lib/para-ti/schema";

export async function POST(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const parsed = marcarLeidosSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta qué avisos marcar." }, { status: 400 });
  const n = await marcarLeidos(g.user.email, "todos" in parsed.data ? "todos" : parsed.data.ids);
  return NextResponse.json({ marcados: n });
}
