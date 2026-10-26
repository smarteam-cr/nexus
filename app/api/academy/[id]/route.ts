/**
 * /api/academy/[id] — cambiar o archivar una lista del catálogo de HubSpot Academy (Q1, 2026-10-27).
 *
 *   PATCH {cambios}  → los campos que vienen; `activa: false` la archiva (no se borra: un kickoff guarda su copia y el
 *                      catálogo conserva de dónde salió). Lo mantienen la líder de Customer Success y dirección.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { actualizarListaDeAcademy, ErrorDeAcademy } from "@/lib/kickoff/academy-server";

type Params = { params: Promise<{ id: string }> };

const Cambios = z.strictObject({
  nombre: z.string().min(1).max(200).optional(),
  enlace: z.string().min(1).max(1000).optional(),
  hub: z.string().min(1).max(40).optional(),
  rol: z.string().min(1).max(40).optional(),
  duracionMinutos: z.number().int().min(0).max(6000).nullable().optional(),
  descripcion: z.string().max(500).nullable().optional(),
  orden: z.number().int().min(0).max(100000).optional(),
  activa: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  if (!z.string().cuid().safeParse(id).success) return NextResponse.json({ error: "Lista inválida" }, { status: 400 });
  const cuerpo = Cambios.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Revisa los datos de la lista." }, { status: 400 });
  try {
    return NextResponse.json({ lista: await actualizarListaDeAcademy(id, cuerpo.data) });
  } catch (e) {
    if (e instanceof ErrorDeAcademy) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
