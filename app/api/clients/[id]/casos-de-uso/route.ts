/**
 * La cuenta › Casos de uso (2026-10-12, pedido de Elías: una sección aparte, como la escala).
 *
 * GET  → los casos de uso de la empresa (en un ciclo, en el plan de crecimiento, sugeridos y cerrados) y los ciclos
 *        abiertos donde se puede sumar uno.
 * POST → suma un caso: al plan de crecimiento o al ciclo abierto de un proyecto.
 *
 * Leer pide acceso al cliente; escribir, además, poder editar el cronograma (la misma vara que el ciclo).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { casosDeLaEmpresa, crearCasoDeLaEmpresa, ErrorDelCiclo } from "@/lib/servicios/ciclos-server";
import { crearCasoDeLaEmpresaSchema } from "@/lib/servicios/schema";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    const puedeEditar = !((await guardCapability("editTimeline")) instanceof NextResponse);
    return NextResponse.json({ ...(await casosDeLaEmpresa(id)), puedeEditar });
  } catch (e) {
    console.error("[clients/casos-de-uso]", e);
    return NextResponse.json({ error: "No se pudieron cargar los casos de uso." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const cap = await guardCapability("editTimeline");
  if (cap instanceof NextResponse) return cap;
  const body = crearCasoDeLaEmpresaSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const c = await crearCasoDeLaEmpresa(id, body.data, guard.user.email ?? "desconocido");
    return NextResponse.json({ ok: true, id: c.id });
  } catch (e) {
    if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[clients/casos-de-uso]", e);
    return NextResponse.json({ error: "No se pudo guardar el caso de uso." }, { status: 500 });
  }
}
