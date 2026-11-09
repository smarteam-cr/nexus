/**
 * GET /api/sales/exploraciones/empresas?q=<nombre o dominio>&after=<cursor>
 *
 * Las empresas del HubSpot de Smarteam, de a una página, para elegir con quién planificar: con `q`,
 * las que calzan con el nombre o el dominio; sin `q`, las de actividad de ventas más reciente. Son
 * miles: se pide página por página, nunca todas. Marca las que ya tienen una exploración viva y las
 * que ya son clientes en Nexus. No crea nada. Pide `preventa.read`.
 *
 * Una empresa con varias unidades (DECISIONS «Una empresa con varias unidades») sale como una opción
 * por ficha: la principal y cada unidad, cada una con SU preventa; y buscar por el nombre de una unidad
 * la encuentra aunque HubSpot no la conozca (lib/exploraciones/unidades-en-la-lista.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { buscarEmpresas } from "@/lib/exploraciones/hubspot";
import { industriaLegible } from "@/lib/exploraciones/industria";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { armarOpciones, type FichaDeLaLista } from "@/lib/exploraciones/unidades-en-la-lista";

export async function GET(req: NextRequest) {
  const guard = await guardPermission("preventa", "read");
  if (guard instanceof NextResponse) return guard;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const crudo = req.nextUrl.searchParams.get("after");
  // El cursor de HubSpot es un número: cualquier otra cosa se ignora.
  const after = crudo && /^\d{1,10}$/.test(crudo) ? crudo : null;

  const pagina = await buscarEmpresas(q, after);
  if (pagina === null) {
    return NextResponse.json({ error: "No se pudo consultar HubSpot. Revisa la conexión del sistema." }, { status: 502 });
  }
  const { siguiente } = pagina;
  const empresas = pagina.empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    dominio: e.dominio,
    industria: industriaLegible(e.industria),
    pais: e.pais,
    ultimaActividad: e.ultimaActividad,
  }));

  /* Las fichas de las empresas de la página (el id de HubSpot del cliente es el vivo; una fusionada se resuelve al
     abrirla) y todas las de empresas con unidades: son pocas, y con ellas se arma cada grupo y se busca por nombre. */
  const ids = empresas.map((e) => e.id);
  const filas = await prisma.client.findMany({
    where: {
      OR: [
        ...(ids.length > 0 ? [{ hubspotCompanyId: { in: ids } }] : []),
        { comparteDominioConId: { not: null } },
        { entidadesDelDominio: { some: {} } },
      ],
    },
    select: {
      id: true,
      name: true,
      kind: true,
      hubspotCompanyId: true,
      comparteDominioConId: true,
      siglas: true,
      emailDomains: true,
      industry: true,
      ...(modeloDisponible(prisma.exploracionDeVenta)
        ? { exploracionesDeVenta: { where: { archivadaEn: null, ...DE_LA_PREVENTA }, select: { id: true }, take: 1 } }
        : {}),
    },
  });
  const fichas: FichaDeLaLista[] = filas.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    hubspotCompanyId: f.hubspotCompanyId,
    comparteDominioConId: f.comparteDominioConId,
    siglas: f.siglas,
    emailDomains: f.emailDomains,
    industry: f.industry,
    exploracionId: (f as { exploracionesDeVenta?: { id: string }[] }).exploracionesDeVenta?.[0]?.id ?? null,
  }));

  return NextResponse.json({
    empresas: armarOpciones({ empresas, fichas, q, primeraPagina: after === null }),
    siguiente,
  });
}
