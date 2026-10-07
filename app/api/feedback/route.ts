/**
 * /api/feedback — los reportes de quien está logueado.
 *
 * GET  → «Mis reportes» y los pedidos de opinión abiertos que le hicieron.
 * POST → manda un reporte desde cualquier pantalla interna. Lo puede mandar todo el equipo interno.
 *        A quien revisa le llega el aviso en «Para ti» (urgente si a la persona le frena el trabajo).
 */
import { after, NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { crearReporte } from "@/lib/feedback/mutations";
import { ideasEn30Dias, misReportes, pedidosAbiertosDe } from "@/lib/feedback/queries";
import { CrearReporte } from "@/lib/feedback/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;
  const [reportes, pedidos] = await Promise.all([misReportes(guard.user.email), pedidosAbiertosDe(guard.user.email)]);
  return NextResponse.json({ reportes, pedidos });
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearReporte.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  try {
    const r = await crearReporte(
      parsed.data,
      { email: guard.user.email, nombre: guard.teamMember?.name || guard.user.email, rol: guard.role ?? null },
      // El aviso a dirección, después de responder: quien reporta no lo espera.
      { avisarDespues: (tarea) => after(tarea) },
    );
    const ideas = parsed.data.tipo === "mejora" ? await ideasEn30Dias(guard.user.email) : 0;
    return NextResponse.json({ reporte: r, ideasEn30Dias: ideas }, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
