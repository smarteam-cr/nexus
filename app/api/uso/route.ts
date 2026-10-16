/**
 * POST /api/uso — el latido: la persona abrió una sección de Nexus (etapa 4a de docs/mi-dia-plan.md).
 *
 * Lo manda components/layout/LatidoDeUso.tsx al entrar a una sección o al volver después de 30 minutos. El cuerpo
 * trae solo la ruta: la sección la decide el servidor con la misma regla (`seccionDeLaRuta`), y el correo sale de la
 * sesión, nunca del cuerpo. No guarda la ruta: ni qué cliente ni qué documento.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { esSeccionValida, seccionDeLaRuta } from "@/lib/uso/secciones";
import { anotarApertura } from "@/lib/uso/registro-server";

export const dynamic = "force-dynamic";

const cuerpo = z.object({ ruta: z.string().min(1).max(500).startsWith("/") });

export async function POST(req: Request) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const p = cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "ruta inválida" }, { status: 400 });
  const seccion = seccionDeLaRuta(p.data.ruta);
  if (!seccion || !esSeccionValida(seccion)) return new NextResponse(null, { status: 204 });
  await anotarApertura(g.teamMember.email, seccion);
  return new NextResponse(null, { status: 204 });
}
