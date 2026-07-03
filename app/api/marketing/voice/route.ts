/**
 * /api/marketing/voice — voz/posicionamiento de marca (singleton).
 * GET (cualquier interno) · PUT { brandVoice } (editores).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getSettings } from "@/lib/marketing/queries";
import { updateBrandVoice } from "@/lib/marketing/mutations";
import { voicePutSchema } from "@/lib/marketing/schema";
import { BRAND_VOICE_SEED } from "@/lib/marketing/seed-data";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const settings = await getSettings();
  return NextResponse.json({ brandVoice: settings?.brandVoice ?? BRAND_VOICE_SEED });
}

export async function PUT(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = voicePutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "La voz no puede estar vacía (máx 8000 caracteres)." }, { status: 400 });
  }

  const settings = await updateBrandVoice(parsed.data.brandVoice);
  return NextResponse.json({ brandVoice: settings.brandVoice });
}
