/**
 * /api/tareas/operaciones — APLICAR lo que se acordó en el chat de tareas (docs/tareas-plan.md §6.5).
 *
 *   POST { turnoId, desmarcadas } → aplica, todo o nada, lo que quedó marcado del acuerdo de ese turno.
 *
 * ⛔ El acuerdo lo lee el servidor del hilo de quien pide: el navegador no manda operaciones. Responde «Ya estaba
 * aplicado» a un segundo clic, 409 si el acuerdo ya no está vigente y 422 (sin escribir) si algo cambió desde que se
 * acordó. Es de todo el equipo interno; lo propio no lleva celda (conversar sí: `asistente.read`).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser, guardPermission } from "@/lib/auth/api-guards";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { aplicarDelChat } from "@/lib/tareas/chat/aplicar";
import { vistaDelHilo } from "@/lib/tareas/chat/vista";
import { hiloVivo } from "@/lib/asistente/hilo";
import { PIEZA_TAREAS } from "@/lib/asistente/piezas";

const Cuerpo = z.object({
  turnoId: z.string().trim().min(1, "Falta el acuerdo.").max(60),
  desmarcadas: z.array(z.number().int().min(0).max(200)).max(200).default([]),
});

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Cuerpo.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });
  try {
    const r = await aplicarDelChat(p, usuarioEmail, parsed.data.turnoId, parsed.data.desmarcadas);
    // El hilo como quedó (con el desenlace que se acaba de escribir): el cajón lo pinta sin volver a pedirlo.
    const { hilo } = vistaDelHilo(await hiloVivo({ dueno: { personal: true }, pieza: PIEZA_TAREAS, usuarioEmail }));
    return NextResponse.json({ ...r, hilo, ...(r.yaEstaba ? { mensaje: "Ya estaba aplicado." } : {}) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
