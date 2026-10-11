/**
 * /api/tareas/leer-reunion — «Leer una reunión» (docs/tareas-plan.md §5.4).
 *
 * GET  ?q= → tus reuniones recientes (o buscadas por título), con su gemela marcada y si ya se leyó.
 * POST     → pide la lectura. Corre en segundo plano (`after`): la pantalla consulta /api/tareas/lecturas/[id]. Si la
 *            reunión espera a la lectura de seguimiento (una reunión con un cliente), se le pide YA a esa lectura.
 * Cada reunión se lee UNA vez; tope de 10 lecturas pedidas por persona por día.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { lecturasDeReuniones, pedirLectura, procesarLectura } from "@/lib/tareas/lectura";
import { LeerReunion } from "@/lib/tareas/schema";
import { reunionesDeTuCalendarioParaTareas } from "@/lib/sessions/reuniones-para-tareas";
import { equipoDeLaMayoria } from "@/lib/tareas/equipos";
import { rolPorDefecto } from "@/lib/tareas/semana";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const reuniones = await reunionesDeTuCalendarioParaTareas({ email: p.ctx.email, esSuperAdmin: p.ctx.esSuperAdmin, clientes: p.clientes }, q);
    const leidas = await lecturasDeReuniones(reuniones.map((r) => r.id));
    return NextResponse.json({
      reuniones: reuniones.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        inicio: r.inicio.toISOString(),
        fin: r.fin.toISOString(),
        participantes: r.participantes.length,
        conNotas: !!r.notas,
        largoNotas: r.notas?.length ?? 0,
        actionItems: r.actionItems.length,
        largoTranscript: r.largoTranscript,
        puertasAdentro: r.puertasAdentro,
        cliente: r.puertasAdentro ? null : r.duenoClienteNombre,
        gemelaDe: r.gemelaDe,
        lectura: leidas.get(r.id) ?? null,
        rolSugerido: rolPorDefecto(r.inicio, r.titulo),
        equipoSugerido: equipoDeLaMayoria(r.participantes, p.ctx.miembros),
      })),
    });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = LeerReunion.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    const l = await pedirLectura(p.ctx, p.clientes, parsed.data);
    if (!l.yaLeida && l.estado === "leyendo") after(() => procesarLectura(l.id));
    // Una reunión con un cliente o un prospecto que espera en la cola de la lectura de seguimiento: se le pide YA (a
    // nombre y contra el presupuesto de quien la pidió); al terminar deja la salida de Tareas. Una sola pasada: Tareas
    // no la lee por su cuenta.
    if (l.esperaAlSeguimiento && l.sessionId) {
      const sessionId = l.sessionId;
      const email = p.ctx.email;
      after(async () => {
        const { leerAhora } = await import("@/lib/lecturas/leer");
        await leerAhora(sessionId, { pedidaPorEmail: email }).catch((e) => console.error(`[tareas] no se pudo pedir la lectura de seguimiento de ${sessionId}:`, e instanceof Error ? e.message : e));
      });
    }
    return NextResponse.json(l);
  } catch (e) {
    return respuestaDeError(e);
  }
}
