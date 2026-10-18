/**
 * /api/projects/[projectId]/recurrencia — la recomendación de pasar este servicio temporal a SmartLoop
 * (docs/smartloop-plan.md, etapa 6; la regla en lib/servicios/recurrencia.ts).
 *
 *   GET  → { recomendacion: RecomendacionDelProyecto | null } — null = el proyecto no califica.
 *   POST { accion: "tarea" | "alta" | "descartar", motivo? } → { estado, accion, href }
 *
 * Leer pide acceso al proyecto; decidir, además, ser de Customer Success o dirección. ⛔ Nada de esto escribe en
 * HubSpot: «tarea» deja una tarea al CSE (por el escritor único de Tareas) y «alta» devuelve la dirección del alta.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { decidirRecomendacion, ErrorDeRecurrencia, recomendacionDelProyecto } from "@/lib/servicios/recurrencia-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const recomendacion = await recomendacionDelProyecto(projectId, {
    email: guard.user.email,
    rol: guard.user.teamMember?.roleEnum ?? null,
  });
  return NextResponse.json({ recomendacion });
}

const Cuerpo = z.object({
  accion: z.enum(["tarea", "alta", "descartar"]),
  motivo: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const tm = guard.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Tu cuenta no tiene un miembro del equipo." }, { status: 403 });

  let cuerpo: z.infer<typeof Cuerpo>;
  try {
    const r = Cuerpo.safeParse(await req.json());
    if (!r.success) return NextResponse.json({ error: "Elige qué hacer con la recomendación." }, { status: 400 });
    cuerpo = r.data;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  try {
    const r = await decidirRecomendacion(projectId, tm, { accion: cuerpo.accion, motivo: cuerpo.motivo ?? null });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorDeRecurrencia) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
