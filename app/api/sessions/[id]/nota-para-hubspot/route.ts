/**
 * POST /api/sessions/[id]/nota-para-hubspot — la nota para HubSpot que Nexus sugiere después de una reunión con el
 * cliente (etapa 5 de docs/mi-dia-plan.md). Esas reuniones no quedan en el registro de HubSpot: la nota lleva lo
 * acordado.
 *
 *   { accion: "usar", texto }  → la guarda (con el texto que dejó la persona) y la escribe en HubSpot.
 *   { accion: "descartar" }    → queda registrado que no se usó; no se vuelve a sugerir.
 *
 * La reunión tiene que tener tarjeta (un dueño cliente o prospecto, y no de puertas adentro) y quien la decide, acceso a
 * ese cliente: sin eso, 404. Una sola decisión por reunión (409 si otra persona ya la tomó).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/supabase";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { reunionParaLaTarjeta } from "@/lib/sessions/reuniones-para-seguimiento";
import { MAX_TEXTO_DE_LA_NOTA, diaDeCostaRica, notaSugeridaDeLaMinuta, reunionConNotaSugerida, textosDeLaMinuta } from "@/lib/notas/reglas";
import { ErrorDeLaNota, descartarNotaSugerida, usarNotaSugerida } from "@/lib/notas/escritura-server";

type Params = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("usar"),
    texto: z.string().trim().min(1, "La nota no puede ir vacía.").max(MAX_TEXTO_DE_LA_NOTA, `La nota admite hasta ${MAX_TEXTO_DE_LA_NOTA} caracteres.`),
  }),
  z.object({ accion: z.literal("descartar") }),
]);

const noEncontrada = () => NextResponse.json({ error: "Esa reunión no tiene nota para HubSpot." }, { status: 404 });

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "No se entendió qué hacer con la nota.", 400);

  const reunion = await reunionParaLaTarjeta(id);
  if (!reunion) return noEncontrada();
  try {
    await requireAccessToClient(reunion.clientId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return noEncontrada();
    throw e;
  }
  if (!reunionConNotaSugerida(diaDeCostaRica(new Date(reunion.fecha)))) return noEncontrada();

  const minuta = await prisma.sessionMinute.findUnique({ where: { sessionId: id }, select: { summary: true, agreements: true, decisions: true } });
  const sugerida = minuta
    ? notaSugeridaDeLaMinuta({
        titulo: reunion.titulo,
        fecha: diaDeCostaRica(new Date(reunion.fecha)),
        resumen: minuta.summary,
        acuerdos: textosDeLaMinuta(minuta.agreements),
        decisiones: textosDeLaMinuta(minuta.decisions),
      })
    : null;
  if (!sugerida) return noEncontrada();

  const r = {
    sessionId: id,
    clientId: reunion.clientId,
    fecha: reunion.fecha,
    projectId: reunion.proyectos.length === 1 ? reunion.proyectos[0].id : null,
  };
  const quien = { email: guard.user.email, rol: guard.user.teamMember?.roleEnum ?? null };
  try {
    if (parsed.data.accion === "usar") {
      const nota = await usarNotaSugerida(r, quien, parsed.data.texto);
      return NextResponse.json({ estado: "usada", notaId: nota.id, hubspotEstado: nota.hubspotEstado, hubspotError: nota.hubspotError });
    }
    await descartarNotaSugerida(r, quien, sugerida);
    return NextResponse.json({ estado: "descartada" });
  } catch (e) {
    if (e instanceof ErrorDeLaNota) return apiError(e.message, e.status);
    throw e;
  }
}
