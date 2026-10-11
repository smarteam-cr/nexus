/**
 * POST /api/projects/[projectId]/handoff/congelar — «Congelar» el handoff (etapa 3b, DECISIONS «El handoff se
 * congela»).
 *
 * Deja el handoff como la foto fija de lo vendido: foto protegida + hito «congelado» en su canvas
 * (lib/handoff/congelado-server.ts). Sigue editable a mano; la IA ya no lo regenera y lo nuevo llega como
 * sugerencias con «Buscar lo nuevo».
 *
 * Congela quien tiene la celda `handoff.congelar` (2026-10-10): por defecto el CSE, la CSL, Ventas y dirección.
 * Es celda propia y no `handoff.regenerate` porque el CSE congela y no regenera: congelar no reescribe el
 * documento. La misma celda pide «Buscar lo nuevo» en /analyze; «Rehacer desde cero» sigue con `regenerate`. El
 * acceso al proyecto lo da `guardAccessToProject`, y el veto de dueño es el de todas las escrituras del handoff
 * (lib/handoff/duenio.ts).
 *
 * Responde el estado del congelado. Congelar dos veces no hace nada la segunda.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";
import { congelarHandoff } from "@/lib/handoff/congelado-server";

type Params = { params: Promise<{ projectId: string }> };

const POR_QUE_NO: Record<string, { status: number; message: string }> = {
  "sin-documento": { status: 404, message: "Este proyecto no tiene documento de handoff todavía." },
  "sin-contenido": { status: 409, message: "El handoff está vacío: genéralo antes de congelarlo." },
  "sin-foto": { status: 500, message: "No se pudo guardar la foto del handoff. Vuelve a intentarlo." },
  "falta-la-tabla": { status: 503, message: "Falta aplicar la migración del estado del documento (scripts/sql/2026-10-02-estado-del-documento.sql)." },
  error: { status: 500, message: "No se pudo congelar el handoff. Vuelve a intentarlo." },
};

export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const acceso = await guardAccessToProject(projectId);
  if (acceso instanceof NextResponse) return acceso;
  const permiso = await guardPermission("handoff", "congelar");
  if (permiso instanceof NextResponse) return permiso;
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

  const r = await congelarHandoff(projectId, { via: "boton", porEmail: permiso.user.email ?? null });
  if (!r.ok) {
    const no = POR_QUE_NO[r.motivo] ?? POR_QUE_NO.error;
    return NextResponse.json({ error: r.motivo, message: no.message }, { status: no.status });
  }
  return NextResponse.json({ ok: true, nuevo: r.nuevo, congelado: r.estado });
}
