import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento, guardProjectHandoffAccess, guardTimelineEdit } from "@/lib/auth/api-guards";
import { documentoDelDestino } from "@/lib/contexto/documento";
import { buscarEnTuCalendario } from "@/lib/sessions/calendario-de-quien-busca";
import { parseDestino, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";

/**
 * GET /api/projects/[projectId]/session-candidates/calendario?para=<destino>&q=
 *
 * «De tu calendario» del buscador de «Contexto adicional», en TODOS los documentos de un proyecto
 * (Elías, 2026-10-07: «siempre se debe poder buscar y agregar cualquier sesión de Meet del usuario o
 * del cliente»). Hasta ese día solo lo tenía el cronograma (timeline/calendario, que se retiró).
 * Las reuniones del proyecto y del cliente las trae session-candidates; acá van las de quien busca:
 * donde fue organizador o invitado, que todavía no son de este proyecto. La consulta y sus reglas
 * viven en lib/sessions/calendario-de-quien-busca.ts.
 *
 * Solo lectura. El guard es el de la PUERTA de ese documento: el buscador existe para elegir, y quien
 * no puede elegir no lo abre. El cronograma sigue con el suyo (cronograma.write), sin el del handoff.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const destino = parseDestino(req.nextUrl.searchParams.get("para"));
  const guard = await guardDeLaPuerta(projectId, destino);
  if (guard instanceof NextResponse) return guard;

  const r = await buscarEnTuCalendario({
    email: guard.teamMember.email ?? "",
    clientId: guard.clientId,
    projectId,
    q: req.nextUrl.searchParams.get("q") ?? "",
    documento: nombreDelDocumento(destino),
  });
  return NextResponse.json(r);
}

/** El guard de la puerta que escribe en ese documento (la misma que usa su POST de sesiones). */
function guardDeLaPuerta(projectId: string, destino: DestinoDeContexto) {
  if (destino === "cronograma") return guardTimelineEdit(projectId);
  const doc = documentoDelDestino(destino);
  if (doc) return guardContextoDelDocumento(projectId, doc.seccion);
  return guardProjectHandoffAccess(projectId);
}

function nombreDelDocumento(destino: DestinoDeContexto): string {
  if (destino === "cronograma") return "el cronograma";
  return documentoDelDestino(destino)?.elDocumento ?? "el handoff";
}
