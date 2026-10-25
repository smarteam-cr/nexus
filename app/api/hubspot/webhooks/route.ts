/**
 * POST /api/hubspot/webhooks — los AVISOS de HubSpot (webhooks, U10, 2026-10-25). PÚBLICA (PUBLIC_PATHS del middleware):
 * HubSpot no tiene sesión. Lo único que la protege es la FIRMA v3 con el secreto de la app (`HUBSPOT_CLIENT_SECRET`,
 * lib/hubspot/webhooks.ts): sin firma válida, 401 y no se guarda nada.
 *
 * Hace lo mínimo y responde rápido (HubSpot corta a los 5 s y reintenta): guarda los avisos en `EventoDeHubspot` (uno por
 * aviso; el que llega repetido se descarta por su clave) y contesta 200. Los procesa el job `hubspot-eventos`
 * (lib/hubspot/eventos-server.ts), que dispara la copia de ese registro. Un aviso de otro portal se guarda como
 * «ignorado». Sin el SQL (2026-10-25-hubspot-contexto.sql) responde 503: HubSpot reintenta durante 24 horas.
 *
 * ⚙ Lo configura Elías en la app de HubSpot (docs/RUNBOOK.md › «Los avisos de HubSpot»): la URL
 * `https://nexus.smarteamcr.com/api/hubspot/webhooks` y las suscripciones. Mientras no estén, esta ruta no recibe nada y
 * el sondeo de cada hora sigue siendo la única copia.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { eventosDelAviso, MAX_CUERPO_DEL_AVISO, uriFirmada, verificarFirma } from "@/lib/hubspot/webhooks";

export const dynamic = "force-dynamic";

/**
 * El cuerpo como texto, cortando en `MAX_CUERPO_DEL_AVISO`: la ruta es pública y se lee ANTES de verificar la firma (la
 * firma va sobre el cuerpo), así que un envío enorme no puede cargarse entero en memoria. null = pasó el tope.
 */
async function leerConTope(req: NextRequest): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > MAX_CUERPO_DEL_AVISO) return null;
  if (!req.body) return "";
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CUERPO_DEL_AVISO) {
      await lector.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}

export async function POST(req: NextRequest) {
  const cuerpo = await leerConTope(req);
  if (cuerpo === null) return NextResponse.json({ error: "demasiado grande" }, { status: 413 });

  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
  const veredicto = verificarFirma({
    secreto: process.env.HUBSPOT_CLIENT_SECRET,
    metodo: "POST",
    uri: uriFirmada(appUrl, `${req.nextUrl.pathname}${req.nextUrl.search}`),
    cuerpo,
    timestamp: req.headers.get("x-hubspot-request-timestamp"),
    firma: req.headers.get("x-hubspot-signature-v3"),
    ahora: Date.now(),
  });
  if (veredicto !== "valida") {
    console.warn(`[hubspot/webhooks] aviso rechazado: ${veredicto}`);
    return NextResponse.json({ error: "firma inválida" }, { status: veredicto === "sin_secreto" ? 503 : 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const eventos = eventosDelAviso(json);
  if (!eventos.length) return NextResponse.json({ ok: true, guardados: 0 });

  try {
    const sistema = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
    const portal = sistema?.hubspotPortalId ?? null;
    const r = await prisma.eventoDeHubspot.createMany({
      data: eventos.map((e) => {
        const otroPortal = !!portal && !!e.portalId && e.portalId !== portal;
        return {
          clave: e.clave,
          objeto: e.objeto,
          tipo: e.tipo,
          hubspotId: e.hubspotId,
          propiedad: e.propiedad,
          valor: e.valor,
          idsFusionados: e.idsFusionados,
          idSobreviviente: e.idSobreviviente,
          ocurrioAt: e.ocurrioAt,
          estado: otroPortal ? "ignorado" : "pendiente",
          ...(otroPortal ? { error: `otro portal (${e.portalId})`, procesadoAt: new Date() } : {}),
        };
      }),
      skipDuplicates: true,
    });
    return NextResponse.json({ ok: true, guardados: r.count });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "falta el SQL 2026-10-25-hubspot-contexto.sql" }, { status: 503 });
    console.error("[hubspot/webhooks] no se pudieron guardar los avisos", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "no se pudo guardar" }, { status: 500 });
  }
}
