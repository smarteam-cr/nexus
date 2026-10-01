/**
 * GET /api/sales/exploraciones/empresas?q=<nombre o dominio>&after=<cursor>
 *
 * Las empresas del HubSpot de Smarteam, de a una página, para elegir con quién planificar: con `q`,
 * las que calzan con el nombre o el dominio; sin `q`, las de actividad de ventas más reciente. Son
 * miles: se pide página por página, nunca todas. Marca las que ya tienen una exploración viva y las
 * que ya son clientes en Nexus. No crea nada. Pide `ventas.read`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { buscarEmpresas } from "@/lib/exploraciones/hubspot";
import { industriaLegible } from "@/lib/exploraciones/industria";

export async function GET(req: NextRequest) {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const crudo = req.nextUrl.searchParams.get("after");
  // El cursor de HubSpot es un número: cualquier otra cosa se ignora.
  const after = crudo && /^\d{1,10}$/.test(crudo) ? crudo : null;

  const pagina = await buscarEmpresas(q, after);
  if (pagina === null) {
    return NextResponse.json({ error: "No se pudo consultar HubSpot. Revisa la conexión del sistema." }, { status: 502 });
  }
  const { empresas, siguiente } = pagina;

  /* Las que ya tienen exploración: se abre esa en vez de crear otra. Por el cliente de Nexus de la
     empresa (el id de HubSpot del cliente es el vivo; una fusionada se resuelve al abrirla). */
  const conExploracion = new Map<string, string>();
  const clientes = new Set<string>();
  if (empresas.length > 0) {
    const filas = await prisma.client.findMany({
      where: { hubspotCompanyId: { in: empresas.map((e) => e.id) } },
      select: {
        hubspotCompanyId: true,
        kind: true,
        ...(modeloDisponible(prisma.exploracionDeVenta)
          ? { exploracionesDeVenta: { where: { archivadaEn: null }, select: { id: true }, take: 1 } }
          : {}),
      },
    });
    for (const f of filas) {
      if (!f.hubspotCompanyId) continue;
      if (f.kind === "CLIENTE") clientes.add(f.hubspotCompanyId);
      const viva = (f as { exploracionesDeVenta?: { id: string }[] }).exploracionesDeVenta?.[0];
      if (viva) conExploracion.set(f.hubspotCompanyId, viva.id);
    }
  }

  return NextResponse.json({
    empresas: empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      dominio: e.dominio,
      industria: industriaLegible(e.industria),
      pais: e.pais,
      ultimaActividad: e.ultimaActividad,
      esCliente: clientes.has(e.id),
      exploracionId: conExploracion.get(e.id) ?? null,
    })),
    siguiente,
  });
}
