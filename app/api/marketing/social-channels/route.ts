/**
 * GET /api/marketing/social-channels — canales sociales conectados en HubSpot
 * (LinkedIn/FB/IG…), para elegir destino al enviar una idea como borrador.
 * 403 del scope `social` → { supported: false, channels: [] } (degrada sin ruido).
 * Editores de marketing.
 */
import { NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { getPublishingChannels } from "@/lib/hubspot/social-broadcast";

export async function GET() {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  try {
    const { supported, channels } = await getPublishingChannels();
    return NextResponse.json({ supported, channels });
  } catch {
    // No es 403 (eso lo maneja getPublishingChannels): error real de red/HubSpot.
    return NextResponse.json({ supported: true, channels: [], error: "No se pudieron leer los canales de HubSpot." }, { status: 502 });
  }
}
