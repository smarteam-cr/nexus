/**
 * GET /api/projects/[projectId]/estado-de-pago — cómo va el pago del proyecto, para Customer Success (2026-11-13): al
 * día, con cuotas vencidas, o la primera cuota sin pagar (la regla de los 15 días, lib/cobranza/estado-de-pago.ts).
 *
 * ⛔ Sin montos: lo lee el CSE, que no ve la plata de la cartera. Alcanza con el acceso al proyecto.
 */
import { NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cargarEstadoDePagoDelProyecto } from "@/lib/cobranza/seguimiento-server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crDateParts } from "@/lib/jobs/time";

type Params = Promise<{ projectId: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ estado: await cargarEstadoDePagoDelProyecto(projectId, crDateParts(new Date()).dateKey) });
  } catch (e) {
    // Sin el SQL del 2026-11-13 la ficha no muestra nada (no es un error para quien la mira).
    if (esquemaDesactualizado(e)) return NextResponse.json({ estado: { clave: "sin-cobranza" } });
    throw e;
  }
}
