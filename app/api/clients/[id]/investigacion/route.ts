/**
 * /api/clients/[id]/investigacion — la investigación web de la empresa (R5, 2026-10-24).
 *
 * GET  → la última investigación y la corrida (para seguir la fase mientras corre).
 * POST → «Actualizar la investigación»: lanza la corrida en segundo plano (una a la vez por empresa). Gasta IA con
 *        búsqueda web (cerca de US$0,30), así que pide la celda de quien decide los datos (`clientes.decidirDatos`).
 *        Lo que encuentra llena lo vacío de lo que manda HubSpot y propone lo demás; nunca cambia lo que decidió una
 *        persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { corridaDeLaInvestigacion, lanzarInvestigacion, ultimaInvestigacion } from "@/lib/clients/investigacion/servidor";

const SIN_SQL = "Falta aplicar scripts/sql/2026-10-25-datos-de-la-empresa.sql y reiniciar.";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  try {
    const [investigacion, corrida] = await Promise.all([ultimaInvestigacion(id), corridaDeLaInvestigacion(id)]);
    return NextResponse.json({ investigacion, corrida });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const permiso = await guardPermission("clientes", "decidirDatos");
  if (permiso instanceof NextResponse) return permiso;
  try {
    const r = await lanzarInvestigacion(id, { triggeredByEmail: acceso.user.email ?? null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r, { status: r.yaCorria ? 200 : 202 });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}
