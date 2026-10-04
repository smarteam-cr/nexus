/**
 * /api/finanzas/revision — la revisión de quien supervisa sobre lo que registró el equipo (rediseño de Finanzas,
 * 2026-10-03, etapa «Revisión»).
 *   GET                                         → lo que está por revisar y lo devuelto.
 *   POST   { accion: BIEN, items }              → «Está bien» (uno, o «Dar por buenos» todos los de la pestaña).
 *   POST   { accion: DEVOLVER, items, comentario } → devolver uno, con lo que hay que corregir.
 *   DELETE { tipo, id }                         → deshacer: vuelve a «por revisar».
 * La huella de los números se calcula en el servidor, nunca viene de la pantalla. Quien revisa sale del guard.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { cargarRevision, deshacerRevision, revisar } from "@/lib/finanzas/revision-server";
import { itemRevisadoSchema, revisarSchema } from "@/lib/finanzas/revision-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function GET() {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await cargarRevision());
}

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, revisarSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json(await revisar(data, guard.user.email));
  } catch (e) {
    return responderError(e, "revision");
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, itemRevisadoSchema);
  if (data instanceof NextResponse) return data;
  await deshacerRevision(data);
  return NextResponse.json({ ok: true });
}
