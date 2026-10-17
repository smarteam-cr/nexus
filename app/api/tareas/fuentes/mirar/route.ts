/**
 * POST /api/tareas/fuentes/mirar — mira las series de los sprints y lee sola cada reunión nueva que terminó (ficha A,
 * 2026-10-17). La pide Tareas al abrirse; corre después de responder (`after`) y como mucho una vez cada 10 minutos por
 * proceso (lib/tareas/fuentes-server.ts › `mirarLasSeriesDelSprint`). Cuando se sume a lib/jobs/defs.ts, el job llama
 * a la misma función.
 */
import { after, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas } from "@/lib/tareas/http";
import { mirarLasSeriesDelSprint } from "@/lib/tareas/fuentes-server";

export async function POST() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  after(() => mirarLasSeriesDelSprint().then(() => undefined));
  return NextResponse.json({ ok: true });
}
