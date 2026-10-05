/**
 * GET  /api/sales/exploraciones/[id]/propuesta
 *   Lo que el paso «Propuesta» del lienzo necesita: los negocios de la empresa en HubSpot (para
 *   elegir el de la propuesta), el catálogo de casos de uso y las propuestas de la EMPRESA —las que
 *   usan esta preventa y las que no, para usarla en una que ya existe (2026-10-05). Pide
 *   `ventas.read`. Solo lee.
 *
 * POST /api/sales/exploraciones/[id]/propuesta   body: { dealId, nombre? }
 *   Arma la Propuesta de Nexus (lib/exploraciones/propuesta.ts) y devuelve su id; el texto lo
 *   escribe después la generación de siempre. Pide `ventas.write`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardPermission } from "@/lib/auth/api-guards";
import { armarPropuesta, catalogoDeCasosDeUso, negociosDeLaEmpresa } from "@/lib/exploraciones/propuesta";
import { propuestasDeLaEmpresa } from "@/lib/exploraciones/en-las-propuestas";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  dealId: z.string().trim().regex(/^\d+$/, "Id de negocio de HubSpot inválido"),
  nombre: z.string().trim().max(200).optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const companyId = lectura.fila.client.hubspotCompanyId;
  const [negocios, catalogo, propuestas] = await Promise.all([
    companyId ? negociosDeLaEmpresa(companyId) : Promise.resolve([]),
    catalogoDeCasosDeUso(),
    propuestasDeLaEmpresa(id),
  ]);
  return NextResponse.json({ negocios, catalogo, propuestas });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("ventas", "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const r = await armarPropuesta({
    exploracionId: id,
    dealId: cuerpo.data.dealId,
    nombre: cuerpo.data.nombre ?? null,
    email: guard.user.email ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ businessCaseId: r.businessCaseId }, { status: 201 });
}
