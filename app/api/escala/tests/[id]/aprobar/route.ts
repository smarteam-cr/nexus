/**
 * POST /api/escala/tests/[id]/aprobar { preguntas } — aprueba el borrador de un banco de preguntas: pasa a ser lo que ve el público
 * (área O, 2026-10-26). Antes revisa las reglas del banco contra la escala vigente (lib/tests-diagnostico/banco.ts):
 * con algún problema no aprueba nada y dice cuál.
 *
 * Solo los super admin.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { aprobarElBorrador } from "@/lib/tests-diagnostico/admin-server";
import { GuardarBorradorSchema } from "@/lib/tests-diagnostico/schema";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { ErrorSinTablas, SQL_DE_LOS_TESTS } from "@/lib/tests-diagnostico/repositorio-server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const { id } = await params;
  // Las preguntas que la persona tenía en pantalla: se aprueba eso o nada.
  const parsed = GuardarBorradorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    const r = await aprobarElBorrador(id, parsed.data.preguntas, ctx.user.email);
    switch (r.estado) {
      case "aprobado":
        return NextResponse.json({ ok: true });
      case "no-existe":
        return NextResponse.json({ error: "Ese banco de preguntas no existe." }, { status: 404 });
      case "sin-escala":
        return NextResponse.json({ error: "No hay una escala publicada contra la que revisarlo." }, { status: 409 });
      case "con-problemas":
        return NextResponse.json({ error: "Todavía no se puede aprobar:", detalle: r.problemas }, { status: 422 });
      case "cambio-en-el-medio":
        return NextResponse.json({ error: "El borrador guardado no es el que tienes en pantalla: alguien lo cambió. Vuelve a cargar la página." }, { status: 409 });
    }
  } catch (e) {
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LOS_TESTS}.` }, { status: 503 });
    throw e;
  }
}
