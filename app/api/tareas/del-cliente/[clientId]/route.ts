/**
 * GET /api/tareas/del-cliente/[clientId] — la ficha del cliente › La cuenta › Tareas (ficha A del roadmap, 2026-10-17):
 * todo lo que Smarteam tiene que hacer con esa empresa, de cualquier equipo, con de dónde viene cada tarea.
 *
 * Lo arma `cargarTareasDeLaCuenta` con la regla de visibilidad de todas las listas de Tareas: nunca lo «Solo para mí» de
 * otros, y la cita y el contexto de cada reunión con su regla. 404 si el cliente no existe o no lo ves. Marcar y decidir
 * van por las rutas de siempre (`/api/tareas/[id]`), por el único escritor.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { errorDeValidacion, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTareasDeLaCuenta } from "@/lib/tareas/consultas";

type Params = { params: Promise<{ clientId: string }> };

const ClientIdParam = z.string().trim().min(1, "Falta el id.").max(64, "Ese id no es válido.");

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const parsed = ClientIdParam.safeParse((await params).clientId);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const clientId = parsed.data;
  try {
    const p = await prepararTareas(guard);
    if (p instanceof NextResponse) return p;
    // Quien ve toda la cartera pasa el filtro de acceso con cualquier id: un cliente que no existe es 404, no una lista vacía.
    if (p.clientes.todos && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Ese cliente no existe." }, { status: 404 });
    }
    return NextResponse.json(await cargarTareasDeLaCuenta(p.ctx, p.clientes, clientId));
  } catch (e) {
    return respuestaDeError(e);
  }
}
