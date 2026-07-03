/**
 * /api/marketing/pillar-suggestions/[id] — PATCH { action: approve | discard }.
 * approve = crea el ContentPillar (origin AGENT) + re-linkea ideas huérfanas (tx).
 * Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { approvePillarSuggestion, discardPillarSuggestion } from "@/lib/marketing/mutations";
import { suggestionActionSchema } from "@/lib/marketing/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = suggestionActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida (approve | discard)" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "approve") {
      const result = await approvePillarSuggestion(id);
      return NextResponse.json({ ok: true, pillar: result.pillar, relinkedIdeas: result.relinkedIdeas });
    }
    await discardPillarSuggestion(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo procesar la sugerencia.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
