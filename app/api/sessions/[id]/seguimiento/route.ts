/**
 * PATCH /api/sessions/[id]/seguimiento — lo que una persona cambia en la página de una reunión (ficha G, 2026-10-17):
 *
 *   { agenda }   → lo que se iba a tratar, escrito a mano ("" lo borra: vuelve a mandar la invitación)
 *   { correo, version } → el asunto o el texto del correo de seguimiento (solo si ya está armado). `version` es la de
 *                  lo guardado que tiene la pantalla: si cambió (se regeneró, otra pestaña lo editó), 409 y no se pisa
 *   { proxima }  → el título, el objetivo, la hora o la duración de la próxima reunión sugerida, o lo que se decidió
 *                  («agendada»: la guardó en su calendario; «descartada»: no hace falta; null: vuelve a pendiente)
 *
 * Pide un usuario interno con acceso al cliente dueño de la reunión (`guardAccesoALaReunion`: sin acceso, 404). El
 * correo y la próxima piden además que la reunión tenga dueño. Nexus no escribe en el calendario ni manda el correo.
 *
 * «Ya la agendé» deja además la reunión planeada en Tareas (fase 2, 2026-10-17): una tarea de clase «reunion» de quien
 * la agendó, con la cuenta, la hora y quienes estuvieron en esta reunión, para que la cuenta cuente como con reunión. Si
 * eso falla, lo de la página queda igual (se registra).
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { editarCorreo, guardarAgenda, guardarProxima } from "@/lib/seguimiento/reunion/guardado-server";
import { CambioDelSeguimiento } from "@/lib/seguimiento/reunion/schema";
import { leerSeguimiento } from "@/lib/seguimiento/reunion/guardado-server";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { planearReunion } from "@/lib/tareas/mutaciones";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;

  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = CambioDelSeguimiento.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  const c = parsed.data;

  try {
    if ("agenda" in c) {
      await guardarAgenda(id, c.agenda, acceso.user.email);
      return NextResponse.json({ ok: true });
    }
    if (!acceso.dueno) return NextResponse.json({ error: "Esta reunión no tiene cliente: no lleva correo ni próxima reunión." }, { status: 409 });
    if ("correo" in c) {
      const r = await editarCorreo(id, c.correo, c.version);
      if (!r.ok && r.motivo === "sin-correo") return NextResponse.json({ error: "Todavía no hay un correo armado para esta reunión." }, { status: 404 });
      if (!r.ok) return NextResponse.json({ error: "El correo cambió: recarga la página para ver el de ahora." }, { status: 409 });
      return NextResponse.json({ ok: true, version: r.version });
    }
    await guardarProxima(id, c.proxima, acceso.user.email);
    if (c.proxima.estado === "agendada") await dejarLaReunionPlaneada(id, acceso.dueno, acceso.user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: "A la base le falta el SQL de la página de la reunión. Corre npm run check:esquema." }, { status: 503 });
    }
    throw e;
  }
}

/** La reunión planeada de «Ya la agendé». Nunca lanza: la página ya guardó lo suyo. */
async function dejarLaReunionPlaneada(sessionId: string, clientId: string, user: AppUserWithTeamMember) {
  try {
    if (!user.teamMember || !(await tareasDisponible())) return;
    const [s, sesion] = await Promise.all([leerSeguimiento(sessionId), prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { title: true, participants: true } })]);
    const p = s.proxima;
    if (!p?.inicio) return;
    const [ctx, clientes] = await Promise.all([contextoDeTareas(user), clientesQueVesParaTareas(user.teamMember)]);
    await planearReunion(ctx, clientes, {
      clientId,
      titulo: p.titulo?.trim() || `Seguimiento de «${sesion?.title ?? "la reunión"}»`,
      inicio: p.inicio,
      invitados: sesion?.participants ?? [],
      objetivo: p.objetivo,
      deLaReunion: sessionId,
    });
  } catch (e) {
    console.error(`[seguimiento] la reunión ${sessionId}: no se pudo dejar la reunión planeada en Tareas:`, e instanceof Error ? e.message : e);
  }
}
