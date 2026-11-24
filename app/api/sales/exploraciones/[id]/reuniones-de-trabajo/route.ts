/**
 * GET /api/sales/exploraciones/[id]/reuniones-de-trabajo
 *   Las reuniones de trabajo que Nexus sugiere sumar a la preventa de un CLIENTE (24 nov, el TEC; etapa 2 de
 *   docs/diagnostico-con-lo-que-sabemos-plan.md): las de la empresa con transcripción, por cuánto habló el cliente, primero
 *   la mejor de cada equipo (lib/exploraciones/reuniones-de-trabajo-server.ts, la misma cuenta que usa el script del
 *   borrador). Las lee el selector de «+ Agregar sesión» una vez al abrirse; se suman con POST …/sesiones y
 *   `deLoQueYaSabemos: true`.
 *   En un prospecto o en la exploración de un proyecto, vacío. Solo lee, por el chokepoint de sesiones (invariante #1). Pide
 *   poder cambiar la exploración, como el buscador (existe para elegir), y acceso a la empresa (`guardAccessToClient`): mira
 *   sus reuniones, y el permiso de preventa no las da (la regla del chat, 21 nov).
 */
import { NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { reunionesDeTrabajoSugeridas } from "@/lib/exploraciones/reuniones-de-trabajo-server";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const fila = lectura.fila;
  if (fila.projectId || !partirDeLoQueYaSabemos(fila.client.kind)) return NextResponse.json({ sugeridas: [] });
  const acceso = await guardAccessToClient(fila.clientId);
  if (acceso instanceof NextResponse) return NextResponse.json({ error: "Para sugerir reuniones de trabajo necesitas acceso a esta empresa." }, { status: 403 });
  try {
    return NextResponse.json({ sugeridas: await reunionesDeTrabajoSugeridas(fila.clientId) });
  } catch (e) {
    console.error("[exploraciones/reuniones-de-trabajo]", e);
    return NextResponse.json({ error: "No se pudieron sugerir las reuniones de trabajo." }, { status: 500 });
  }
}
