/**
 * POST /api/tareas/[id]/agenda — los bloques de una tarea en el calendario de su dueña (docs/tareas-plan.md §5.9).
 *
 *   · `crear`        → Nexus crea un bloque privado por horario en TU calendario (JWT aparte, `calendar.events.owned`).
 *                       Sin el permiso responde 409 con `sinPermiso`, y la pantalla ofrece el enlace de plantilla.
 *   · `ya_la_agende` → la guardaste tú con el enlace: queda agendada, sin id de evento.
 *   · `quitar`       → quita los bloques de TU calendario. Lo puede hacer quien tiene el bloque aunque la tarea ya no
 *                       sea suya; si es la responsable, la deja sin agendar.
 * Agendar: solo la dueña de la tarea, y solo en la semana de hoy o una futura. Al reagendar, sus bloques que todavía no
 * terminaron se borran de Calendar después de crear los nuevos (si no se pueden borrar, se conservan en la lista).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTarea } from "@/lib/tareas/consultas";
import { anotarAgenda, soltarMisBloques, urlDeLaTarea } from "@/lib/tareas/mutaciones";
import { repartirBloques, type BloqueDeAgenda } from "@/lib/tareas/estados";
import { Agendar } from "@/lib/tareas/schema";
import { AgendaSinPermiso, crearBloques, quitarBloques } from "@/lib/google/agenda";

/** Borra de Calendar los bloques propios que todavía no terminaron. Devuelve los que NO se pudieron borrar (se conservan). */
async function moverMisBloques(email: string, bloques: readonly BloqueDeAgenda[]): Promise<BloqueDeAgenda[]> {
  const { miosQueVienen } = repartirBloques(bloques, email, new Date());
  if (!miosQueVienen.length) return [];
  try {
    await quitarBloques(email, miosQueVienen);
    return [];
  } catch (e) {
    console.error("[tareas] no se pudieron quitar los bloques viejos:", e instanceof Error ? e.message : e);
    return miosQueVienen;
  }
}

function urlAbsoluta(req: NextRequest, ruta: string): string {
  const base = process.env.APP_URL || req.nextUrl.origin;
  return new URL(ruta, base).toString();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Agendar.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  const d = parsed.data;
  try {
    const { tarea } = await cargarTarea(p.ctx, p.clientes, id);
    if (d.modo === "quitar") {
      // Lo autoriza ser la dueña del CALENDARIO, no de la tarea: un bloque viejo lo quita quien lo tiene.
      const { mios } = repartirBloques(tarea.agenda.bloques, p.ctx.email, new Date());
      if (!mios.length) return NextResponse.json({ error: "No tienes bloques de esta tarea en tu calendario." }, { status: 403 });
      let quitados = 0;
      let sinPermiso = false;
      try {
        quitados = await quitarBloques(p.ctx.email, mios);
      } catch (e) {
        if (!(e instanceof AgendaSinPermiso)) throw e;
        // Sin permiso para borrar: igual sale de la tarea, y la persona lo quita a mano en Calendar.
        sinPermiso = true;
      }
      await soltarMisBloques(p.ctx, id);
      return NextResponse.json({ ...(await cargarTarea(p.ctx, p.clientes, id)), quitados, sinPermiso });
    }
    if (!tarea.acciones.agendar) return NextResponse.json({ error: "Solo la dueña agenda la tarea, y en la semana de hoy o una futura." }, { status: 403 });
    if (d.modo === "ya_la_agende") {
      const conservar = await moverMisBloques(p.ctx.email, tarea.agenda.bloques);
      await anotarAgenda(p.ctx, id, d.bloques.map((b) => ({ calendario: p.ctx.email, eventoId: null, inicio: b.inicio, fin: b.fin })), d.minutos, new Date(), conservar);
      return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
    }
    try {
      const creados = await crearBloques({ email: p.ctx.email, tareaId: id, titulo: tarea.titulo, url: urlAbsoluta(req, urlDeLaTarea(id)), bloques: d.bloques });
      // Los nuevos ya están: recién ahora se borran los que venían (si algo falla antes, no queda la tarea sin bloque).
      const conservar = await moverMisBloques(p.ctx.email, tarea.agenda.bloques);
      await anotarAgenda(p.ctx, id, creados.map((c) => ({ calendario: p.ctx.email, eventoId: c.eventoId, inicio: c.inicio, fin: c.fin })), d.minutos, new Date(), conservar);
    } catch (e) {
      if (e instanceof AgendaSinPermiso) return NextResponse.json({ error: e.message, sinPermiso: true, url: urlAbsoluta(req, urlDeLaTarea(id)) }, { status: 409 });
      throw e;
    }
    return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
