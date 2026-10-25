/**
 * PATCH /api/clients/[id]/datos/propuestas/[propuestaId] — usar, editar o descartar una propuesta de un dato de la
 * empresa (R1, 2026-10-24). Pide el acceso a la empresa Y la celda `clientes.decidirDatos` (CSE, CSL, Ventas y los
 * super admin). Si otra persona la decidió primero, 409.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { decidirPropuesta, ErrorDeDato } from "@/lib/clients/datos-de-la-empresa-server";
import { DecisionDePropuestaSchema } from "@/lib/clients/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; propuestaId: string }> }) {
  const { id, propuestaId } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const permiso = await guardPermission("clientes", "decidirDatos");
  if (permiso instanceof NextResponse) return permiso;
  const tm = acceso.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Solo el equipo decide los datos de la empresa." }, { status: 403 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = DecisionDePropuestaSchema.safeParse(cuerpo);
  if (!parsed.success) return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });

  try {
    const resultado = await decidirPropuesta({ clientId: id, propuestaId, decision: parsed.data, decidePorId: tm.id });
    return NextResponse.json({ resultado });
  } catch (e) {
    if (e instanceof ErrorDeDato) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-25-datos-de-la-empresa.sql." }, { status: 503 });
    throw e;
  }
}
