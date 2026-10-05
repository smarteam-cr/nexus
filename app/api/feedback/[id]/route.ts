/**
 * GET /api/feedback/[id] — un reporte con su captura y su conversación.
 *
 * Lo ve quien lo escribió y quien revisa (SUPER_ADMIN). A cualquier otra persona le contesta 404, no
 * 403: confirmar que un reporte existe ya es información. Abrirlo deja leído hasta ahora.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { sinTablas } from "@/lib/feedback/http";
import { marcarLeido } from "@/lib/feedback/mutations";
import { reporteParaVer } from "@/lib/feedback/queries";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const { id } = await params;
  const esRevisor = esRevisorDeFeedback(guard.role);
  const reporte = await reporteParaVer(id, { email: guard.user.email, esRevisor });
  if (!reporte) return NextResponse.json({ error: "Ese reporte no existe." }, { status: 404 });

  const esAutor = reporte.autor.email === guard.user.email.toLowerCase();
  await marcarLeido(id, esAutor ? "autor" : "revisor");
  return NextResponse.json({ reporte });
}
