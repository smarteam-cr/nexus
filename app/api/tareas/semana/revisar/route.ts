/**
 * POST /api/tareas/semana/revisar — «Revisa tu semana» (docs/tareas-plan.md §5.8).
 *
 *   · `responder` → una fila: La terminé · Sigue · Para más adelante · Ya no se hará. Se guarda al hacer clic.
 *   · `cerrar`    → cierra la revisión de esa semana cuando no queda nada sin responder.
 * La tuya, o (como líder) las tareas de tu sprint de otra persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cerrarRevision, responderRevision } from "@/lib/tareas/mutaciones";
import { RevisarSemana } from "@/lib/tareas/schema";

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = RevisarSemana.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const d = parsed.data;
  try {
    if (d.accion === "cerrar") {
      return NextResponse.json({ ok: true, ...(await cerrarRevision(p.ctx, d.persona ?? p.ctx.email, d.semana)) });
    } else if (d.resultado === "no_se_hara") {
      await responderRevision(p.ctx, d.semana, { tareaId: d.tareaId, resultado: "no_se_hara", motivo: d.motivo ?? "" });
    } else if (d.resultado === "mas_adelante") {
      await responderRevision(p.ctx, d.semana, { tareaId: d.tareaId, resultado: "mas_adelante", desde: d.desde ?? null });
    } else {
      await responderRevision(p.ctx, d.semana, { tareaId: d.tareaId, resultado: d.resultado });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
