/**
 * GET /api/sales/exploraciones/empresas?q=<nombre o dominio>
 *
 * Busca empresas en el HubSpot de Smarteam para abrir una exploración. Devuelve VARIAS coincidencias
 * (hasta 10) para que el vendedor elija, y marca las que ya tienen una exploración viva. No crea nada.
 * Pide `ventas.read`.
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
  if (q.length < 2) return NextResponse.json({ empresas: [] });

  const empresas = await buscarEmpresas(q);
  if (empresas === null) {
    return NextResponse.json({ error: "No se pudo consultar HubSpot. Revisa la conexión del sistema." }, { status: 502 });
  }

  /* Las que ya tienen exploración: se abre esa en vez de crear otra. Por el cliente de Nexus de la
     empresa (el id de HubSpot del cliente es el vivo; una fusionada se resuelve al abrirla). */
  const conExploracion = new Map<string, string>();
  if (empresas.length > 0 && modeloDisponible(prisma.exploracionDeVenta)) {
    const vivas = await prisma.exploracionDeVenta.findMany({
      where: { archivadaEn: null, client: { hubspotCompanyId: { in: empresas.map((e) => e.id) } } },
      select: { id: true, client: { select: { hubspotCompanyId: true } } },
    });
    for (const v of vivas) if (v.client.hubspotCompanyId) conExploracion.set(v.client.hubspotCompanyId, v.id);
  }

  return NextResponse.json({
    empresas: empresas.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      dominio: e.dominio,
      industria: industriaLegible(e.industria),
      pais: e.pais,
      exploracionId: conExploracion.get(e.id) ?? null,
    })),
  });
}
