/**
 * POST /api/sessions/[id]/contexto — lo que cuenta quien estuvo en una reunión sin texto, respondiendo las preguntas
 * de Nexus (T9, 2026-10-25). { respuestas: [{ pregunta, respuesta }], extra }
 *
 * Pide acceso a la reunión, que tenga dueña y que quien responde haya estado (la organizó o estaba invitado). Se guarda
 * como el texto de la reunión, marcado «lo contó una persona», y entra a la lectura. Lo demás:
 * lib/sessions/preguntas-de-contexto-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { guardarRespuestas } from "@/lib/sessions/preguntas-de-contexto-server";
import { ContextoDeLaReunion } from "@/lib/sessions/reunion-schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  if (!acceso.dueno) return NextResponse.json({ error: "Primero elige de qué empresa es la reunión." }, { status: 409 });
  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = ContextoDeLaReunion.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const r = await guardarRespuestas(id, acceso.dueno, parsed.data, { email: acceso.user.email, nombre: acceso.user.teamMember?.name ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, lectura: r.lectura });
}
