/**
 * Cambia un caso de uso de la empresa (La cuenta › Casos de uso): sus textos, su estado o «Quitar» (queda descartado,
 * nada se borra). Pide acceso al cliente y poder editar el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { actualizarCasoDeLaEmpresa, ErrorDelCiclo } from "@/lib/servicios/ciclos-server";
import { actualizarCasoDeLaEmpresaSchema } from "@/lib/servicios/schema";

type Params = Promise<{ id: string; casoId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id, casoId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const cap = await guardCapability("editTimeline");
  if (cap instanceof NextResponse) return cap;
  const body = actualizarCasoDeLaEmpresaSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    await actualizarCasoDeLaEmpresa(id, casoId, body.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[clients/casos-de-uso]", e);
    return NextResponse.json({ error: "No se pudo guardar el caso de uso." }, { status: 500 });
  }
}
