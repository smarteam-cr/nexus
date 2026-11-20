/**
 * /api/clients/[id]/plan-general/acceso — el «Acceso» y el «Publicar» del plan general (lib/plan-general/acceso.ts).
 *
 *   POST    → crea el enlace, o da uno nuevo si estaba revocado, y publica lo de hoy si nunca se publicó. 409 sin actividades.
 *   PATCH   → «Publicar»: el cliente pasa a ver lo de hoy. 409 sin acceso.
 *   DELETE  → revoca: el enlace deja de abrir (la foto se queda).
 * Pide acceso a la cuenta y poder editar el cronograma (`editTimeline`): quien mueve el plan lo puede mostrar.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import {
  crearAccesoAlPlan,
  ErrorDelAccesoAlPlan,
  estadoDelAccesoAlPlan,
  publicarElPlan,
  revocarAccesoAlPlan,
  type EstadoDelAccesoAlPlan,
} from "@/lib/plan-general/acceso";

type Ctx = { params: Promise<{ id: string }> };

/** Después de `guardAccessToClient` (cada handler lo llama con el id de la URL): poder editar el cronograma. */
const guardDeEscritura = () => guardCapability("editTimeline");

async function responder(hacer: () => Promise<EstadoDelAccesoAlPlan>) {
  try {
    return NextResponse.json(await hacer());
  } catch (e) {
    if (e instanceof ErrorDelAccesoAlPlan) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e))
      return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-11-19-plan-general-de-la-cuenta.sql y reiniciar." }, { status: 503 });
    throw e;
  }
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const guard = await guardDeEscritura();
  if (guard instanceof NextResponse) return guard;
  return responder(() => crearAccesoAlPlan(id, guard.user.email ?? null));
}

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const guard = await guardDeEscritura();
  if (guard instanceof NextResponse) return guard;
  return responder(async () => {
    await publicarElPlan(id, guard.user.email ?? null);
    return estadoDelAccesoAlPlan(id);
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const guard = await guardDeEscritura();
  if (guard instanceof NextResponse) return guard;
  return responder(() => revocarAccesoAlPlan(id));
}
