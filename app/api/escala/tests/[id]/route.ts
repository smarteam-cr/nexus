/**
 * PUT /api/escala/tests/[id] { preguntas } — guarda el borrador de un banco de preguntas del test (área O, 2026-10-26).
 * No toca lo aprobado: el público sigue viendo la versión aprobada hasta que se apruebe la nueva. Devuelve lo que le
 * falta para poder aprobarlo.
 *
 * Solo los super admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { guardarElBorrador } from "@/lib/tests-diagnostico/admin-server";
import { ErrorSinTablas, SQL_DE_LOS_TESTS } from "@/lib/tests-diagnostico/repositorio-server";
import { GuardarBorradorSchema } from "@/lib/tests-diagnostico/schema";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const { id } = await params;
  const parsed = GuardarBorradorSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    const r = await guardarElBorrador(id, parsed.data.preguntas, ctx.user.email);
    if (r.estado === "no-existe") return NextResponse.json({ error: "Ese banco de preguntas no existe." }, { status: 404 });
    return NextResponse.json({ preguntas: r.preguntas, problemas: r.problemas });
  } catch (e) {
    if (e instanceof ErrorSinTablas) return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LOS_TESTS}.` }, { status: 503 });
    throw e;
  }
}
