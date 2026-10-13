/**
 * La cuenta › La escala (2026-10-12): dónde está la empresa en cada área, con la fecha y de dónde sale. GET, solo
 * lectura; pide acceso al cliente. Ver lib/exploraciones/escala-de-la-empresa.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { escalaDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await escalaDeLaEmpresa(id));
  } catch (e) {
    console.error("[clients/escala]", e);
    return NextResponse.json({ error: "No se pudo cargar la escala de la empresa." }, { status: 500 });
  }
}
