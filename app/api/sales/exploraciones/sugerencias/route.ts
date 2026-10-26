/**
 * GET /api/sales/exploraciones/sugerencias — «Llegaron por el test».
 *
 * Las empresas cuyo contacto hizo el test de marketing desde que existe (12 de junio de 2026), leídas
 * de la nota que deja el test (lib/exploraciones/llegadas.ts). Es lo que Marketing le pasa a Ventas.
 * Sin las pruebas internas, sin las que ya tienen una exploración viva y sin las que Nexus marca como
 * de Smarteam o aliadas (`INTERNO`, `ALIADO`). Los clientes SÍ van (decisión de Elías, 2026-10-01):
 * también son exploraciones por hacer, y se marcan.
 *
 * Lo de HubSpot se guarda 3 minutos en memoria (son ~10 pedidos): abrir la página varias veces no
 * vuelve a leerlo. Pide `ventas.read`. Solo lee HubSpot.
 *
 * K10 (2026-10-27): cada empresa trae quién llenó el test de cada área (`porArea`), y los intentos sin empresa en
 * HubSpot llegan agrupados por el dominio del correo (`sinEmpresaPorDominio`), con el portal (`portalId`) para abrir el
 * listado de empresas de HubSpot y crearla allá (Nexus no crea empresas en HubSpot).
 */
import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { llegadasDelTest } from "@/lib/exploraciones/llegadas-server";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";

export async function GET() {
  const guard = await guardPermission("preventa", "read");
  if (guard instanceof NextResponse) return guard;

  const datos = await llegadasDelTest();
  if (datos === null) {
    return NextResponse.json({ error: "No se pudo consultar HubSpot. Revisa la conexión del sistema." }, { status: 502 });
  }
  const portalId = await portalDelSistema().catch(() => null);
  const sinEmpresa = { sinEmpresa: datos.sinEmpresa, sinEmpresaPorDominio: datos.sinEmpresaPorDominio, portalId };
  if (datos.llegadas.length === 0) return NextResponse.json({ llegadas: [], ...sinEmpresa });

  const ids = datos.llegadas.map((l) => l.companyId);
  const clientes = await prisma.client.findMany({
    where: { hubspotCompanyId: { in: ids } },
    select: {
      hubspotCompanyId: true,
      kind: true,
      ...(modeloDisponible(prisma.exploracionDeVenta)
        ? { exploracionesDeVenta: { where: { archivadaEn: null, projectId: null }, select: { id: true }, take: 1 } }
        : {}),
    },
  });
  const kindDe = new Map(clientes.map((c) => [c.hubspotCompanyId, c.kind]));
  const fuera = new Set(
    clientes
      .filter((c) => c.kind === "INTERNO" || c.kind === "ALIADO" || ((c as { exploracionesDeVenta?: unknown[] }).exploracionesDeVenta?.length ?? 0) > 0)
      .map((c) => c.hubspotCompanyId),
  );
  return NextResponse.json({
    llegadas: datos.llegadas
      .filter((l) => !fuera.has(l.companyId))
      .map((l) => ({ ...l, esCliente: kindDe.get(l.companyId) === "CLIENTE" })),
    ...sinEmpresa,
  });
}
