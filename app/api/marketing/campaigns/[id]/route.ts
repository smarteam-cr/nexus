/**
 * /api/marketing/campaigns/[id] — PATCH { action: approve | discard } · DELETE.
 * Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { reviewCampaign, deleteCampaign } from "@/lib/marketing/mutations";
import { campaignPatchSchema } from "@/lib/marketing/schema";

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
  const parsed = campaignPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida (approve | discard)" }, { status: 400 });
  }

  try {
    const campaign = await reviewCampaign(id, parsed.data.action);
    return NextResponse.json({ campaign });
  } catch {
    return NextResponse.json({ error: "La campaña no existe" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deleteCampaign(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La campaña no existe" }, { status: 404 });
  }
}
