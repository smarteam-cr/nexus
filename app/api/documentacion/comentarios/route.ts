import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { hilosAbiertos } from "@/lib/documentacion/consultas-de-comentarios";

/**
 * GET — los hilos abiertos de TODA la base, con su página. Es la lista que abre el contador de
 * arriba del árbol: lo que tiene pendiente quien resuelve.
 */
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  return NextResponse.json({ abiertos: await hilosAbiertos() });
}
