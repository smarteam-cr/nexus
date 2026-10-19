/**
 * /api/tareas/[id] — una tarea.
 *
 * GET   → la tarea con su historia. A quien no la ve le contesta 404, no 403.
 * PATCH → editar, cambiar el estado, moverla de semana o asignarla, con `version` (409 si otra persona la cambió).
 *         Responde apenas queda escrita en Nexus. Después de responder (`after()`): una tarea de HubSpot se escribe allá
 *         (lib/tareas-hubspot, en fila por tarea; si HubSpot no responde, la tarea lo dice y el job `tareas-hubspot` lo
 *         reintenta) y salen los avisos de marcarla hecha. Medido el 2026-10-19 contra la base real: así la respuesta
 *         deja de esperar a HubSpot (1 a 3 s en una tarea de HubSpot) y a los avisos (~0,2 s).
 */
import { after, NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTarea } from "@/lib/tareas/consultas";
import { asignar, cambiarEstado, editarTarea, moverDeSemana, type Diferir } from "@/lib/tareas/mutaciones";
import { PatchTarea } from "@/lib/tareas/schema";
import { reflejarTareaEnHubspot } from "@/lib/tareas-hubspot/sync-server";

type Params = { params: Promise<{ id: string }> };

/** Lo que corre después de responder. Nunca rompe nada: si falla, queda en el log. */
const despues: Diferir = (fn) =>
  after(async () => {
    try {
      await fn();
    } catch (e) {
      console.error("[tareas] lo de después de responder falló:", e instanceof Error ? e.message : e);
    }
  });

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = PatchTarea.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  const d = parsed.data;
  try {
    if (d.accion === "editar") await editarTarea(p.ctx, p.clientes, id, d.version, d.cambios);
    else if (d.accion === "estado") await cambiarEstado(p.ctx, id, d.version, d.hacia, d.motivo, new Date(), { diferir: despues });
    else if (d.accion === "semana") await moverDeSemana(p.ctx, id, d.version, d.destino);
    else await asignar(p.ctx, id, d.version, d.para);
    // Moverla de semana no cambia nada que viva en HubSpot.
    if (d.accion !== "semana") despues(() => reflejarTareaEnHubspot(id));
    return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
