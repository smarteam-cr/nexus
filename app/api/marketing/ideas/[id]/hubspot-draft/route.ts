/**
 * POST /api/marketing/ideas/[id]/hubspot-draft — envía el copy de una idea a
 * HubSpot como BORRADOR social (uno por canal de `channelKeys`), vía el API legacy
 * de broadcast (status: DRAFT — NO publica). Guarda los broadcastGuid en la idea.
 *
 * ⚠️ Integración sobre un API DEPRECADO de HubSpot (scope `social` opcional) —
 * degrada con claridad si HubSpot la corta. Ver docs/RUNBOOK.md. Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createDraftBroadcast } from "@/lib/hubspot/social-broadcast";
import { markIdeaHubspotDraft } from "@/lib/marketing/mutations";
import { hubspotDraftSchema } from "@/lib/marketing/schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = hubspotDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Canales inválidos" }, { status: 400 });
  }

  const idea = await prisma.contentIdea.findUnique({ where: { id }, select: { copy: true } });
  if (!idea) return NextResponse.json({ error: "La idea no existe" }, { status: 404 });

  // Un borrador por canal (secuencial: son 1-3 canales, la latencia no importa).
  // createDraftBroadcast ya no tira (ver social-broadcast.ts), pero el try/catch
  // acá es defensa en profundidad: si algo excepcional pasara igual, no se pierden
  // los resultados de los canales ya procesados (evita reintentos que dupliquen
  // borradores ya creados en HubSpot).
  const results = [];
  for (const channelKey of parsed.data.channelKeys) {
    try {
      results.push(await createDraftBroadcast(channelKey, idea.copy));
    } catch (e) {
      results.push({ channelKey, ok: false as const, error: e instanceof Error ? e.message : "Error inesperado." });
    }
  }

  // "Creado" = ok:true, con o sin broadcastGuid (HubSpot ya hizo el efecto real
  // aunque a veces no devuelva el guid) — separado de "failed" por !ok, así ningún
  // resultado desaparece de ambos conjuntos.
  const okResults = results.filter((r) => r.ok);
  const okGuids = okResults.map((r) => r.broadcastGuid).filter((g): g is string => !!g);
  if (okResults.length > 0) {
    await markIdeaHubspotDraft(id, okGuids);
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    created: okResults.length,
    total: results.length,
    results,
    // Si TODOS fallaron, el front lo muestra como error; si fue parcial, avisa cuáles.
    error: okResults.length === 0 ? (failed[0]?.error ?? "No se pudo crear el borrador en HubSpot.") : undefined,
  }, { status: okResults.length === 0 ? 502 : 200 });
}
