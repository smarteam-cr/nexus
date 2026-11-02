/**
 * /api/projects/[projectId]/planificacion/brief — traer la hoja del Brief de implementación a la Planificación
 * (2026-10-29, pregunta 32 del roadmap; lib/planificacion/brief-importado.ts).
 *
 *   POST { url, confirmado? } → lee la hoja ENTERA con la cuenta de quien la pide (solo lo que esa persona puede abrir en
 *                  Drive) y la deja en la sección SOLO INTERNA `brief_importado`. Reemplaza lo que hubiera traído antes (con
 *                  la foto del documento antes). → { ok, pestanas, titulo }.
 *                  ⛔ Una hoja cuyo título no nombra al cliente NO se guarda: responde 409 { confirmar: true } y hace falta
 *                  mandarla otra vez con `confirmado`. El Brief de otro cliente llegaría a la IA de este (invariante #1).
 *
 * Pide lo mismo que editar el documento (acceso al proyecto, como …/planificacion/plantilla). Nunca toca otra sección.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { prisma } from "@/lib/db/prisma";
import { ErrorDelBrief, guardarBriefEnLaPlanificacion, leerBriefDeGoogle } from "@/lib/planificacion/brief-importado-server";
import { hojaNombraAlCliente } from "@/lib/planificacion/brief-en-lote";

type Params = { params: Promise<{ projectId: string }> };

const IdDelProyecto = z.string().cuid();
const Cuerpo = z.object({ url: z.string().trim().url().max(2000), confirmado: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!IdDelProyecto.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Pega el enlace de la hoja." }, { status: 400 });
  const email = await triggeredByEmail();
  if (!email) return NextResponse.json({ error: "No se sabe con qué cuenta leer la hoja: vuelve a entrar a Nexus." }, { status: 401 });
  try {
    const brief = await leerBriefDeGoogle(email, cuerpo.data.url, { importadoPor: email });
    const cliente = await prisma.client.findUnique({ where: { id: guard.clientId }, select: { name: true } });
    if (!cuerpo.data.confirmado && cliente && !hojaNombraAlCliente(brief.titulo, cliente.name)) {
      return NextResponse.json(
        { error: `La hoja se llama «${brief.titulo}» y no nombra a ${cliente.name}. ¿Es la de este cliente?`, confirmar: true },
        { status: 409 },
      );
    }
    await guardarBriefEnLaPlanificacion(projectId, brief, { actor: email });
    return NextResponse.json({ ok: true, pestanas: brief.pestanas.length, titulo: brief.titulo });
  } catch (e) {
    if (e instanceof ErrorDelBrief) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
