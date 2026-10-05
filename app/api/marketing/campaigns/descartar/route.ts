/**
 * POST /api/marketing/campaigns/descartar — { ids } descarta varias ideas de SEM pendientes de una vez (la cola
 * vieja, rediseño de Marketing 2026-10-04). Las aprobadas no se tocan. Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { descartarCampanas } from "@/lib/marketing/mutations";
import { descartarVariasSchema } from "@/lib/marketing/schema";

export async function POST(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = descartarVariasSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lista de ideas inválida." }, { status: 400 });
  }
  const descartadas = await descartarCampanas(parsed.data.ids);
  return NextResponse.json({ descartadas });
}
