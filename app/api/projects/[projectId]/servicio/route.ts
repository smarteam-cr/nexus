/**
 * /api/projects/[projectId]/servicio — el SERVICIO RECURRENTE del proyecto (roadmap «La siguiente serie», iniciativa 4).
 *
 *   GET                    → GuiaDelServicioDto: la guía del Resumen (qué se entrega, cadencia, qué toca, rutinas) o,
 *                            sin servicio, los servicios del catálogo para «Pasar a recurrente».
 *   GET ?servicio=<clave>  → lo que propone Nexus al pasar a ese servicio (etapa del ciclo, tarea de HubSpot).
 *   POST { accion: "pasar", servicio, etapa? }   → pasa el proyecto a recurrente.
 *   POST { accion: "tareas" }                    → crea las tareas de la rutina de los próximos dos meses.
 *   POST { accion: "agendada", clave }           → «Ya la agendé» de una reunión fija.
 *
 * Leer pide acceso al proyecto; cambiar, además, ser de Customer Success o dirección (lo revisa lib/servicios). ⛔ Nada de
 * esto escribe en HubSpot ni en Google Calendar.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { accionDelServicioSchema } from "@/lib/servicios/schema";
import {
  cargarGuiaDelServicio,
  crearTareasDeLaRutina,
  ErrorDelServicio,
  marcarReunionAgendada,
  pasarARecurrente,
  propuestaParaPasar,
} from "@/lib/servicios/servicio-server";

type Ctx = { params: Promise<{ projectId: string }> };

function errorDe(e: unknown): NextResponse {
  if (e instanceof ErrorDelServicio) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[servicio]", e);
  return NextResponse.json({ error: "No se pudo completar. Inténtalo de nuevo." }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const tm = guard.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Tu cuenta no tiene un miembro del equipo." }, { status: 403 });
  try {
    const clave = req.nextUrl.searchParams.get("servicio");
    if (clave) return NextResponse.json(await propuestaParaPasar(projectId, clave));
    return NextResponse.json(await cargarGuiaDelServicio(projectId, tm));
  } catch (e) {
    return errorDe(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const tm = guard.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Tu cuenta no tiene un miembro del equipo." }, { status: 403 });

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const r = accionDelServicioSchema.safeParse(cuerpo);
  if (!r.success) return NextResponse.json({ error: "No se entendió qué hacer con el servicio." }, { status: 400 });

  try {
    const a = r.data;
    if (a.accion === "pasar") return NextResponse.json(await pasarARecurrente(projectId, tm, { servicio: a.servicio, etapa: a.etapa ?? null }));
    if (a.accion === "tareas") return NextResponse.json(await crearTareasDeLaRutina(projectId, tm));
    await marcarReunionAgendada(projectId, tm, a.clave);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorDe(e);
  }
}
