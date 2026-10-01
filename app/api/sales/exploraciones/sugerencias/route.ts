/**
 * GET /api/sales/exploraciones/sugerencias — «Llegaron por el test».
 *
 * Las empresas cuyo contacto terminó el test de marketing en los últimos 30 días: es lo que
 * Marketing le pasa a Ventas (el prospecto hace el test y agenda la revisión del diagnóstico en la
 * agenda del vendedor). Sin las que ya tienen una exploración viva ni las que ya son clientes.
 * Pide `ventas.read`. Solo lee HubSpot.
 */
import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { llegadasPorElTest } from "@/lib/exploraciones/hubspot";

export async function GET() {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;

  const llegadas = await llegadasPorElTest(30);
  if (llegadas === null) {
    return NextResponse.json({ error: "No se pudo consultar HubSpot. Revisa la conexión del sistema." }, { status: 502 });
  }
  if (llegadas.length === 0) return NextResponse.json({ llegadas: [] });

  const ids = llegadas.map((l) => l.companyId);
  const clientes = await prisma.client.findMany({
    where: { hubspotCompanyId: { in: ids } },
    select: {
      hubspotCompanyId: true,
      kind: true,
      ...(modeloDisponible(prisma.exploracionDeVenta)
        ? { exploracionesDeVenta: { where: { archivadaEn: null }, select: { id: true }, take: 1 } }
        : {}),
    },
  });
  const fuera = new Set(
    clientes
      .filter((c) => c.kind === "CLIENTE" || ((c as { exploracionesDeVenta?: unknown[] }).exploracionesDeVenta?.length ?? 0) > 0)
      .map((c) => c.hubspotCompanyId),
  );
  return NextResponse.json({ llegadas: llegadas.filter((l) => !fuera.has(l.companyId)) });
}
