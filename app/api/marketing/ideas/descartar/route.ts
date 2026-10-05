/**
 * POST /api/marketing/ideas/descartar — { ids } descarta varias publicaciones de una vez (las parecidas de una que
 * se queda, rediseño de Marketing 2026-10-04). Reversible: no borra. Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { descartarIdeas } from "@/lib/marketing/mutations";
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
    return NextResponse.json({ error: "Lista de publicaciones inválida." }, { status: 400 });
  }
  const descartadas = await descartarIdeas(parsed.data.ids);
  return NextResponse.json({ descartadas });
}
