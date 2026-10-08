/**
 * GET  /api/escala/borrador/publicar?edicionesRevisadas=1 — las pruebas del borrador y qué cambia
 *      contra la publicada, sin publicar (lo que muestra «Revisar y publicar»).
 * POST /api/escala/borrador/publicar { revision, edicionesRevisadas } — lo publica: su `.md` pasa a ser
 *      lo que leen las pantallas y lo que se descarga, y el borrador queda congelado. Vuelve a correr las
 *      pruebas; si algo frena, no publica nada.
 *
 * Solo los super admin. La especificación y el manual no se publican desde acá: dicen desde qué
 * versión de la escala valen y cambian por el script (scripts/publicar-escala.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { respuestaDelError, SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { publicarElBorrador, revisarElBorrador } from "@/lib/escala/datos/servidor";

const publicar = z.strictObject({ revision: z.number().int().min(0), edicionesRevisadas: z.boolean() });

export async function GET(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  try {
    return NextResponse.json(await revisarElBorrador(req.nextUrl.searchParams.get("edicionesRevisadas") === "1"));
  } catch (e) {
    const r = respuestaDelError(e);
    if (r) return r;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const parsed = publicar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    return NextResponse.json(await publicarElBorrador({ ...parsed.data, por: ctx.user.email }));
  } catch (e) {
    const r = respuestaDelError(e);
    if (r) return r;
    throw e;
  }
}
