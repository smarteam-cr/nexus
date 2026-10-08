/**
 * POST   /api/escala/borrador { version } — abre el borrador de la próxima versión, desde la publicada.
 * DELETE /api/escala/borrador             — lo descarta, con su bitácora. Una publicada no se toca.
 *
 * Solo los super admin (docs/escala/plan-escala-como-datos.md). Las reglas: lib/escala/datos/versiones.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { respuestaDelError, SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { abrirBorrador, descartarElBorrador } from "@/lib/escala/datos/servidor";

const abrir = z.strictObject({ version: z.string().regex(/^\d+\.\d+\.\d+$/, "tres números: 8.8.0") });

export async function POST(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const parsed = abrir.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    await abrirBorrador(parsed.data.version, ctx.user.email);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    const r = respuestaDelError(e);
    if (r) return r;
    throw e;
  }
}

export async function DELETE() {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  return NextResponse.json({ descartado: await descartarElBorrador() });
}
