/**
 * GET /api/clients/[id]/siguientes-pasos — el siguiente paso vigente de cada equipo en la cuenta (2026-10-15, etapa 2
 * de docs/mi-dia-plan.md): la empresa, sus negocios abiertos y sus proyectos activos. Pide acceso al cliente.
 */
import { NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { pasosDeLaCuenta } from "@/lib/siguiente-paso/lectura-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const r = await pasosDeLaCuenta(id);
  if (!r) return NextResponse.json({ error: "Esa empresa no existe." }, { status: 404 });
  return NextResponse.json(r);
}
